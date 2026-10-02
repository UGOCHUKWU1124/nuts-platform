"use client";

import { useAuthStore } from "@/zustand/auth";
import { useNotificationsStore } from "@/zustand/notifications";
import { useEffect } from "react";

let activeSseCleanup: (() => void) | null = null;
let lastAuthenticatedUserId: string | null = null;

export function useNotifications() {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.role);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUserId = user?.id ?? (isAuthenticated ? "auth" : null);
  const sessionKey = currentUserId
    ? `${(role ?? user?.role ?? "user").toLowerCase()}:${currentUserId}`
    : null;

  const notifications = useNotificationsStore((s) => s.notifications);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const isLoading = useNotificationsStore((s) => s.isLoading);
  const sseConnected = useNotificationsStore((s) => s.sseConnected);
  const hasNextPage = useNotificationsStore((s) => s.hasNextPage);
  const nextCursor = useNotificationsStore((s) => s.nextCursor);

  useEffect(() => {
    if (!isAuthenticated || !sessionKey) {
      if (activeSseCleanup) {
        activeSseCleanup();
        activeSseCleanup = null;
      }
      lastAuthenticatedUserId = null;
      useNotificationsStore.getState().reset();
      return;
    }

    // Only establish stream and fetch initial unread count once per authenticated user session.
    // Prevents redundant /unread-count calls and SSE reconnects on page navigation.
    if (lastAuthenticatedUserId === sessionKey && activeSseCleanup) {
      return;
    }

    if (lastAuthenticatedUserId && lastAuthenticatedUserId !== sessionKey) {
      useNotificationsStore.getState().reset();
    }

    lastAuthenticatedUserId = sessionKey;
    const store = useNotificationsStore.getState();
    store.fetchUnreadCount();
    activeSseCleanup = store.initStream();
  }, [isAuthenticated, sessionKey]);

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
