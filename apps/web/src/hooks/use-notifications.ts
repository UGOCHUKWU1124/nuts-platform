"use client";

import { useAuthStore } from "@/zustand/auth";
import { useNotificationsStore } from "@/zustand/notifications";
import { useEffect } from "react";

let activeSessionKey: string | null = null;

export function useNotifications() {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.role);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeRole = role ?? user?.role ?? "user";
  const currentUserId = user?.id ?? (isAuthenticated ? "auth" : null);
  const sessionKey = currentUserId
    ? `${activeRole.toLowerCase()}:${currentUserId}`
    : null;

  const notifications = useNotificationsStore((s) => s.notifications);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const isLoading = useNotificationsStore((s) => s.isLoading);
  const sseConnected = useNotificationsStore((s) => s.sseConnected);
  const hasNextPage = useNotificationsStore((s) => s.hasNextPage);
  const nextCursor = useNotificationsStore((s) => s.nextCursor);

  useEffect(() => {
    const store = useNotificationsStore.getState();
    if (!isAuthenticated || !sessionKey) {
      if (activeSessionKey !== null) {
        activeSessionKey = null;
        store.reset();
      }
      return;
    }

    if (activeSessionKey !== sessionKey) {
      activeSessionKey = sessionKey;
      store.reset();
    }

    void store.fetchUnreadCount();
    return store.initStream(activeRole, sessionKey);
  }, [activeRole, isAuthenticated, sessionKey]);

  return {
    notifications,
    unreadCount,
    isLoading,
    sseConnected,
    hasNextPage,
    nextCursor,
    fetchNotifications: useNotificationsStore.getState().fetchNotifications,
    fetchUnreadCount: useNotificationsStore.getState().fetchUnreadCount,
    markAsRead: useNotificationsStore.getState().markAsRead,
    markAllAsRead: useNotificationsStore.getState().markAllAsRead,
    deleteNotification: useNotificationsStore.getState().deleteNotification,
    clearAll: useNotificationsStore.getState().clearAll,
  };
}

export function NotificationStreamHost() {
  useNotifications();
  return null;
}
