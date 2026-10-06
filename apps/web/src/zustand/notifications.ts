import {
AppNotification,
notificationsApi,
} from "@/api/notifications";
import { useAuthStore, type AuthRole } from "@/zustand/auth";
import { create } from "zustand";

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
  addNotification: (notification: AppNotification) => void;
  reset: () => void;
  initStream: (role: AuthRole) => () => void;
}

let globalEventSource: EventSource | null = null;
let globalReconnectTimeout: NodeJS.Timeout | null = null;
let streamRefCount = 0;
const unreadCountCache = new Map<string, number>();
const unreadCountRequests = new Map<string, Promise<void>>();

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
          }
          unreadCountCache.set(cacheKey, Date.now());
        }
      } catch {
        // Keep the last known count and retry when the bell is opened again.
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

    // Optimistic update
    set({
      notifications: prevList.map((n) =>
        n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      ),
      unreadCount: Math.max(0, prevCount - 1),
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
    set((state) => ({
      notifications: [
        notification,
        ...state.notifications.filter((n) => n.id !== notification.id),
      ],
      unreadCount: state.unreadCount + (notification.isRead ? 0 : 1),
    }));
  },

  reset: () =>
    {
      unreadCountCache.clear();
      unreadCountRequests.clear();
      set({
        notifications: [],
        unreadCount: 0,
        isLoading: false,
        sseConnected: false,
        hasNextPage: false,
        nextCursor: null,
      });
    },

  initStream: (role) => {
    if (typeof window === "undefined") return () => {};

    streamRefCount++;
    if (globalEventSource) {
      // Stream already established
      return () => {
        streamRefCount = Math.max(0, streamRefCount - 1);
        if (streamRefCount === 0 && globalEventSource) {
          globalEventSource.close();
          globalEventSource = null;
          set({ sseConnected: false });
        }
      };
    }

    let sseRetryCount = 0;
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
        globalEventSource = new EventSource(sseUrl, { withCredentials: true });

        globalEventSource.onopen = () => {
          sseRetryCount = 0;
          set({ sseConnected: true });
        };

        globalEventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const notification = data?.notification ?? data;
            if (notification?.id) {
              get().addNotification({
                ...notification,
                actionUrl: notification.actionUrl ?? notification.link ?? null,
              } as AppNotification);
            }
          } catch {
            // Non-JSON or keep-alive ping
          }
        };

        globalEventSource.onerror = () => {
          set({ sseConnected: false });
          if (globalEventSource) {
            globalEventSource.close();
            globalEventSource = null;
          }
          sseRetryCount = Math.min(sseRetryCount + 1, 5);
          const retryDelay = Math.min(1000 * 2 ** sseRetryCount, 30_000);
          if (streamRefCount > 0 && !globalReconnectTimeout) {
            globalReconnectTimeout = setTimeout(() => {
              globalReconnectTimeout = null;
              if (streamRefCount > 0) connect();
            }, retryDelay);
          }
        };
      } catch {
        set({ sseConnected: false });
      }
    };

    connect();

    return () => {
      streamRefCount = Math.max(0, streamRefCount - 1);
      if (streamRefCount === 0) {
        if (globalReconnectTimeout) {
          clearTimeout(globalReconnectTimeout);
          globalReconnectTimeout = null;
        }
        if (globalEventSource) {
          globalEventSource.close();
          globalEventSource = null;
          set({ sseConnected: false });
        }
      }
    };
  },
}));
