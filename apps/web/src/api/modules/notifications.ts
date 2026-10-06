import { api } from "@/api/core/client";

export type NotificationType =
  | "ORDER_PLACED"
  | "ORDER_CONFIRMED"
  | "ORDER_SHIPPED"
  | "ORDER_DELIVERED"
  | "ORDER_CANCELLED"
  | "PAYMENT_RECEIVED"
  | "PAYOUT_PROCESSED"
  | "LOW_STOCK_ALERT"
  | "SYSTEM_ANNOUNCEMENT";

export type NotificationPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListNotificationsParams {
  cursor?: string;
  limit?: number;
  unreadOnly?: boolean;
  type?: NotificationType;
  category?: "orders" | "payments";
}

export interface CursorPaginationMeta {
  limit: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

export interface NotificationsListResponse {
  data: AppNotification[];
  meta: CursorPaginationMeta;
}

export const notificationsApi = {
  list(params?: ListNotificationsParams, signal?: AbortSignal) {
    return api.get<AppNotification[], CursorPaginationMeta>("/notifications", {
      params,
      signal,
    });
  },

  getById(id: string, signal?: AbortSignal) {
    return api.get<AppNotification>(`/notifications/${encodeURIComponent(id)}`, {
      signal,
    });
  },

  getUnreadCount() {
    return api.get<{ count: number }>("/notifications/unread-count");
  },

  markAsRead(id: string) {
    return api.patch<AppNotification>(`/notifications/${id}/read`);
  },

  markAllAsRead() {
    return api.patch<{ updated: number }>("/notifications/mark-all-read");
  },

  delete(id: string) {
    return api.delete<void>(`/notifications/${id}`);
  },

  clearAll() {
    return api.delete<{ count: number }>("/notifications/clear-all");
  },
};
