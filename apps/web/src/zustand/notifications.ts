import {
  AppNotification,
  notificationsApi,
} from "@/api/notifications";
import { useAuthStore, type AuthRole } from "@/zustand/auth";
import { create } from "zustand";
import { toast } from "sonner";

interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  sseConnected: boolean;
  hasNextPage: boolean;
  nextCursor: string | null;

  fetchNotifications: (cursor?: string, limit?: number, append?: boolean) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  addNotification: (notification: AppNotification) => boolean;
  reset: () => void;
  initStream: (role: AuthRole, sessionKey: string) => () => void;
}

let globalEventSource: EventSource | null = null;
let globalStreamKey: string | null = null;
let streamRefCount = 0;
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
  const notificationsPath =
    role === "admin"
      ? "/admin/notifications"
      : role === "vendor"
        ? "/vendor/notifications"
        : "/account/notifications";

  toast(notification.title, {
    description: notification.message,
    action: {
      label: "View notifications",
      onClick: () => window.location.assign(notificationsPath),
    },
  });
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  sseConnected: false,
  hasNextPage: false,
  nextCursor: null,

  fetchNotifications: async (cursor, limit = 20, append = false) => {
    const auth = useAuthStore.getState();
    const userId = auth.user?.id;
    if (!auth.isAuthenticated || !userId) return;

    const cacheKey = `${auth.role ?? auth.user?.role ?? "user"}:${userId}`;
    set({ isLoading: true });
    try {
      const res = await notificationsApi.list({ cursor, limit });
      const items = res.data ?? [];
      const meta = res.meta;
      const activeAuth = useAuthStore.getState();
      const activeUserId = activeAuth.user?.id;
      const activeCacheKey = activeUserId
        ? `${activeAuth.role ?? activeAuth.user?.role ?? "user"}:${activeUserId}`
        : null;

      if (activeCacheKey === cacheKey) {
        set({
          notifications: append ? [...get().notifications, ...items] : items,
          hasNextPage: meta?.hasNextPage ?? false,
          nextCursor: meta?.nextCursor ?? null,
        });
      }
    } catch {
      // Graceful fallback
    } finally {
      const activeAuth = useAuthStore.getState();
      const activeUserId = activeAuth.user?.id;
      const activeCacheKey = activeUserId
        ? `${activeAuth.role ?? activeAuth.user?.role ?? "user"}:${activeUserId}`
        : null;
      if (activeCacheKey === cacheKey) set({ isLoading: false });
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

  markAsRead: async (id: string) => {
    const prevList = get().notifications;
    const prevCount = get().unreadCount;
    const wasUnread = prevList.some((notification) => notification.id === id && !notification.isRead);

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
      globalEventSource?.close();
      globalEventSource = null;
      globalStreamKey = null;
      streamRefCount = 0;
      set({ sseConnected: false });
    }

    streamRefCount++;
    if (globalEventSource) {
      return createStreamCleanup(sessionKey, set);
    }

    globalStreamKey = sessionKey;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
    const routeByRole: Record<AuthRole, string> = {
      user: "notifications/sse",
      admin: "admin/notifications/sse",
      vendor: "vendors/notifications/sse",
    };
    const route = routeByRole[role];
    const apiPath = new URL(apiUrl, window.location.origin).pathname.replace(
      /\/+$/,
      "",
    );
    const sseUrl = `${apiPath}/${route}`;

    const connect = () => {
      try {
        const eventSource = new EventSource(sseUrl, { withCredentials: true });
        globalEventSource = eventSource;

        eventSource.onopen = () => {
          if (globalEventSource !== eventSource) return;
          set({ sseConnected: true });
          void get().fetchUnreadCount();
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const notification = data?.notification ?? data;
            if (notification?.id) {
              const incomingNotification = {
                ...notification,
                actionUrl: notification.actionUrl ?? notification.link ?? null,
              } as AppNotification;
              if (get().addNotification(incomingNotification)) {
                showIncomingNotification(incomingNotification);
              }
            }
          } catch {
            // Non-JSON or keep-alive ping
          }
        };

        eventSource.onerror = () => {
          if (globalEventSource !== eventSource) return;
          set({ sseConnected: false });
        };
      } catch {
        set({ sseConnected: false });
      }
    };

    connect();

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
      globalEventSource?.close();
      globalEventSource = null;
      globalStreamKey = null;
      set({ sseConnected: false });
    }
  };
}
