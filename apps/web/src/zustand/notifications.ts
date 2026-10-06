import { notificationsApi } from "@/api/notifications";
import { getAuthToken } from "@/api/core/token-storage";
import { performTokenRefresh } from "@/api/core/client";
import type { AppNotification, ListNotificationsParams } from "@/api/notifications";
import { useAuthStore, type AuthRole } from "@/zustand/auth";
import { notificationDetailPath } from "@/lib/notification-path";
import { create } from "zustand";
import { toast } from "sonner";

interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  sseConnected: boolean;
  hasNextPage: boolean;
  nextCursor: string | null;

  fetchNotifications: (
    cursor?: string,
    limit?: number,
    append?: boolean,
    filters?: Pick<ListNotificationsParams, "unreadOnly" | "category" | "type">,
  ) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string, unreadHint?: boolean) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  addNotification: (notification: AppNotification) => boolean;
  reset: () => void;
  initStream: (role: AuthRole, sessionKey: string) => () => void;
}

let globalStreamController: AbortController | null = null;
let globalStreamKey: string | null = null;
let streamRefCount = 0;
let streamGeneration = 0;
let listRequestSequence = 0;
let listRequestController: AbortController | null = null;
const unreadCountCache = new Map<string, number>();
const unreadCountRequests = new Map<string, Promise<void>>();
const receivedNotificationIds = new Set<string>();

function getNotificationSessionKey(): string {
  const auth = useAuthStore.getState();
  return `${auth.role ?? auth.user?.role ?? "user"}:${auth.user?.id ?? ""}`;
}

function showIncomingNotification(notification: AppNotification): void {
  const auth = useAuthStore.getState();
  const role = auth.role ?? auth.user?.role ?? "user";

  toast(notification.title, {
    description: notification.message,
    action: {
      label: "View notifications",
      onClick: () =>
        window.location.assign(notificationDetailPath(role, notification.id)),
    },
  });
}

function getSseUrl(role: AuthRole): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
  const routeByRole: Record<AuthRole, string> = {
    user: "notifications/sse",
    admin: "admin/notifications/sse",
    vendor: "vendors/notifications/sse",
  };
  const apiPath = new URL(apiUrl, window.location.origin).pathname.replace(
    /\/+$/,
    "",
  );
  return `${apiPath}/${routeByRole[role]}`;
}

function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, delay);
    const cancel = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    signal.addEventListener("abort", cancel, { once: true });
  });
}

function parseSseFrame(
  frame: string,
  onData: (data: string) => void,
): void {
  const data = frame
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (data) onData(data);
}

async function readSseResponse(
  response: Response,
  signal: AbortSignal,
  onData: (data: string) => void,
): Promise<void> {
  if (!response.body) throw new Error("SSE response has no readable body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separator: RegExpExecArray | null;
      while ((separator = /(?:\r\n|\r|\n){2}/.exec(buffer)) !== null) {
        parseSseFrame(buffer.slice(0, separator.index), onData);
        buffer = buffer.slice(separator.index + separator[0].length);
      }
    }
    if (buffer.trim()) parseSseFrame(buffer, onData);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function consumeNotificationStream(
  role: AuthRole,
  signal: AbortSignal,
  isCurrent: () => boolean,
  onNotification: (notification: AppNotification) => void,
  onConnectionChange: (connected: boolean) => void,
): Promise<void> {
  const url = getSseUrl(role);
  let retryAttempt = 0;
  let refreshedAfterUnauthorized = false;

  while (!signal.aborted && isCurrent()) {
    const headers = new Headers({ Accept: "text/event-stream" });
    const token = getAuthToken(role);
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers,
        credentials: "include",
        cache: "no-store",
        signal,
      });
    } catch (error) {
      if (signal.aborted) return;
      console.error("Notification stream request failed", error);
      retryAttempt++;
      onConnectionChange(false);
      await waitForRetry(
        Math.min(1000 * 2 ** Math.min(retryAttempt, 5), 30_000),
        signal,
      );
      continue;
    }

    if (response.status === 401 && !refreshedAfterUnauthorized) {
      refreshedAfterUnauthorized = true;
      const refresh = await performTokenRefresh(undefined, role);
      if (refresh.success) continue;
      console.error("Notification stream unauthorized; session refresh failed");
      onConnectionChange(false);
      return;
    }

    if ([401, 403, 404].includes(response.status)) {
      console.error(
        `Notification stream stopped with HTTP ${response.status}; check the session and deployed API route`,
      );
      onConnectionChange(false);
      return;
    }

    if (!response.ok) {
      console.error(`Notification stream returned HTTP ${response.status}`);
      retryAttempt++;
      onConnectionChange(false);
      await waitForRetry(
        Math.min(1000 * 2 ** Math.min(retryAttempt, 5), 30_000),
        signal,
      );
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      console.error("Notification stream returned an unexpected content type", contentType);
      onConnectionChange(false);
      return;
    }

    refreshedAfterUnauthorized = false;
    onConnectionChange(true);
    const connectedAt = Date.now();
    try {
      await readSseResponse(response, signal, (data) => {
        try {
          const parsed: unknown = JSON.parse(data);
          if (!parsed || typeof parsed !== "object") return;
          const value = parsed as Record<string, unknown>;
          const notification = (value.notification ?? value) as Partial<AppNotification> & {
            link?: string | null;
          };
          if (typeof notification.id !== "string") return;
          onNotification({
            ...notification,
            actionUrl: notification.actionUrl ?? notification.link ?? null,
          } as AppNotification);
        } catch {
          console.warn("Ignoring malformed notification stream event");
        }
      });
    } catch (error) {
      if (signal.aborted) return;
      console.error("Notification stream closed unexpectedly", error);
    }

    onConnectionChange(false);
    retryAttempt = Date.now() - connectedAt >= 30_000 ? 0 : retryAttempt + 1;
    await waitForRetry(
      Math.min(1000 * 2 ** Math.min(retryAttempt, 5), 30_000),
      signal,
    );
  }
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  sseConnected: false,
  hasNextPage: false,
  nextCursor: null,

  fetchNotifications: async (cursor, limit = 20, append = false, filters) => {
    const auth = useAuthStore.getState();
    const userId = auth.user?.id;
    if (!auth.isAuthenticated || !userId) return;

    const cacheKey = `${auth.role ?? auth.user?.role ?? "user"}:${userId}`;
    if (!append) {
      listRequestController?.abort();
      listRequestController = new AbortController();
    }
    const requestController = listRequestController;
    const requestSequence = append ? listRequestSequence : ++listRequestSequence;
    set({ isLoading: true });
    try {
      const res = await notificationsApi.list(
        { cursor, limit, ...filters },
        requestController?.signal,
      );
      const items = res.data ?? [];
      const meta = res.meta;
      const activeAuth = useAuthStore.getState();
      const activeUserId = activeAuth.user?.id;
      const activeCacheKey = activeUserId
        ? `${activeAuth.role ?? activeAuth.user?.role ?? "user"}:${activeUserId}`
        : null;

      if (activeCacheKey === cacheKey && requestSequence === listRequestSequence) {
        set({
          notifications: append
            ? [
                ...get().notifications,
                ...items.filter(
                  (item) => !get().notifications.some((existing) => existing.id === item.id),
                ),
              ]
            : items,
          hasNextPage: meta?.hasNextPage ?? false,
          nextCursor: meta?.nextCursor ?? null,
        });
      }
    } catch (error) {
      if (
        requestSequence === listRequestSequence &&
        !(error instanceof Error && error.name === "CanceledError")
      ) {
        console.error("Failed to load notifications", error);
        toast.error("Failed to load notifications. Please try again.");
      }
    } finally {
      const activeAuth = useAuthStore.getState();
      const activeUserId = activeAuth.user?.id;
      const activeCacheKey = activeUserId
        ? `${activeAuth.role ?? activeAuth.user?.role ?? "user"}:${activeUserId}`
        : null;
      if (
        activeCacheKey === cacheKey &&
        requestSequence === listRequestSequence
      ) {
        set({ isLoading: false });
      }
    }
  },

  fetchUnreadCount: async () => {
    const auth = useAuthStore.getState();
    const userId = auth.user?.id;
    if (!auth.isAuthenticated || !userId) return;

    const cacheKey = `${auth.role ?? auth.user?.role ?? "user"}:${userId}`;
    const fetchedAt = unreadCountCache.get(cacheKey) ?? 0;
    if (Date.now() - fetchedAt < 60_000) return;

    const pending = unreadCountRequests.get(cacheKey);
    if (pending) return pending;

    const request = (async () => {
      try {
        const res = await notificationsApi.getUnreadCount();
        if (res.data) {
          const activeAuth = useAuthStore.getState();
          const activeUserId = activeAuth.user?.id;
          const activeCacheKey = activeUserId
            ? `${activeAuth.role ?? activeAuth.user?.role ?? "user"}:${activeUserId}`
            : null;
          if (activeCacheKey === cacheKey) {
            set({ unreadCount: res.data.count || 0 });
            unreadCountCache.set(cacheKey, Date.now());
          }
        }
      } catch (error) {
        console.error("Failed to load notification unread count", error);
      }
    })();

    unreadCountRequests.set(cacheKey, request);
    try {
      await request;
    } finally {
      if (unreadCountRequests.get(cacheKey) === request) {
        unreadCountRequests.delete(cacheKey);
      }
    }
  },

  markAsRead: async (id: string, unreadHint = false) => {
    const prevList = get().notifications;
    const prevCount = get().unreadCount;
    const wasUnread =
      prevList.some((notification) => notification.id === id && !notification.isRead) ||
      unreadHint;

    // Optimistic update
    set({
      notifications: prevList.map((n) =>
        n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      ),
      unreadCount: wasUnread ? Math.max(0, prevCount - 1) : prevCount,
    });

    try {
      await notificationsApi.markAsRead(id);
    } catch {
      // Rollback on failure
      set({ notifications: prevList, unreadCount: prevCount });
    }
  },

  markAllAsRead: async () => {
    const prevList = get().notifications;
    const prevCount = get().unreadCount;

    set({
      notifications: prevList.map((n) => ({
        ...n,
        isRead: true,
        readAt: new Date().toISOString(),
      })),
      unreadCount: 0,
    });

    try {
      await notificationsApi.markAllAsRead();
    } catch {
      set({ notifications: prevList, unreadCount: prevCount });
    }
  },

  deleteNotification: async (id: string) => {
    const target = get().notifications.find((n) => n.id === id);
    const wasUnread = target && !target.isRead;

    set({
      notifications: get().notifications.filter((n) => n.id !== id),
      unreadCount: wasUnread ? Math.max(0, get().unreadCount - 1) : get().unreadCount,
    });

    try {
      await notificationsApi.delete(id);
    } catch {
      get().fetchNotifications();
    }
  },

  clearAll: async () => {
    try {
      await notificationsApi.clearAll();
      set({
        notifications: get().notifications.filter((n) => !n.isRead),
      });
    } catch {
      get().fetchNotifications();
    }
  },

  addNotification: (notification: AppNotification) => {
    let isNew = false;
    set((state) => {
      const existing = state.notifications.find((item) => item.id === notification.id);
      const wasUnread = existing ? !existing.isRead : false;
      const isUnread = !notification.isRead;
      isNew = !receivedNotificationIds.has(notification.id);
      receivedNotificationIds.add(notification.id);
      if (receivedNotificationIds.size > 500) {
        const oldestId = receivedNotificationIds.values().next().value;
        if (oldestId) receivedNotificationIds.delete(oldestId);
      }

      return {
        notifications: [
          notification,
          ...state.notifications.filter((item) => item.id !== notification.id),
        ],
        unreadCount: Math.max(
          0,
          state.unreadCount +
            (existing
              ? Number(isUnread) - Number(wasUnread)
              : Number(isUnread && isNew)),
        ),
      };
    });

    if (isNew) {
      unreadCountCache.delete(getNotificationSessionKey());
    }
    return isNew;
  },

  reset: () =>
    {
      listRequestSequence++;
      listRequestController?.abort();
      listRequestController = null;
      unreadCountCache.clear();
      unreadCountRequests.clear();
      receivedNotificationIds.clear();
      set({
        notifications: [],
        unreadCount: 0,
        isLoading: false,
        sseConnected: false,
        hasNextPage: false,
        nextCursor: null,
      });
    },

  initStream: (role, sessionKey) => {
    if (typeof window === "undefined") return () => {};

    if (globalStreamKey !== null && globalStreamKey !== sessionKey) {
      globalStreamController?.abort();
      globalStreamController = null;
      globalStreamKey = null;
      streamRefCount = 0;
      set({ sseConnected: false });
    }

    streamRefCount++;
    if (globalStreamController) {
      return createStreamCleanup(sessionKey, set);
    }

    globalStreamKey = sessionKey;
    const controller = new AbortController();
    globalStreamController = controller;
    const generation = ++streamGeneration;
    const isCurrent = () =>
      globalStreamController === controller &&
      globalStreamKey === sessionKey &&
      streamGeneration === generation;

    void consumeNotificationStream(
      role,
      controller.signal,
      isCurrent,
      (notification) => {
        if (get().addNotification(notification)) {
          showIncomingNotification(notification);
        }
      },
      (connected) => {
        if (isCurrent()) {
          set({ sseConnected: connected });
          if (connected) void get().fetchUnreadCount();
        }
      },
    );

    return createStreamCleanup(sessionKey, set);
  },
}));

function createStreamCleanup(
  sessionKey: string,
  set: (state: Partial<NotificationsState>) => void,
): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (globalStreamKey !== sessionKey) return;
    streamRefCount = Math.max(0, streamRefCount - 1);
    if (streamRefCount === 0) {
      globalStreamController?.abort();
      globalStreamController = null;
      globalStreamKey = null;
      streamGeneration++;
      set({ sseConnected: false });
    }
  };
}
