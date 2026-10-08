import {
  adminApi,
  userApi,
  vendorApi,
} from "@/api/core/client";
import type { AuthRole } from "../core/token-storage";

export type NotificationType =
  | "ORDER_PLACED"
  | "ORDER_CONFIRMED"
  | "ORDER_SHIPPED"
  | "ORDER_DELIVERED"
  | "ORDER_CANCELLED"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_FAILED"
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

function createNotificationsApi(client: typeof userApi) {
  return {
    list(params?: ListNotificationsParams, signal?: AbortSignal) {
      return client.get<AppNotification[], CursorPaginationMeta>("/notifications", {
        params,
        signal,
      });
    },

    getById(id: string, signal?: AbortSignal) {
      return client.get<AppNotification>(`/notifications/${encodeURIComponent(id)}`, {
        signal,
      });
    },

    getUnreadCount() {
      return client.get<{ count: number }>("/notifications/unread-count");
    },

    markAsRead(id: string) {
      return client.patch<AppNotification>(`/notifications/${id}/read`);
    },

    markAllAsRead() {
      return client.patch<{ updated: number }>("/notifications/mark-all-read");
    },

    delete(id: string) {
      return client.delete<void>(`/notifications/${id}`);
    },

    clearAll() {
      return client.delete<{ count: number }>("/notifications/clear-all");
    },
  };
}

export function notificationsApiForRole(role: AuthRole) {
  switch (role) {
    case "admin":
      return createNotificationsApi(adminApi);
    case "vendor":
      return createNotificationsApi(vendorApi);
    case "user":
      return createNotificationsApi(userApi);
  }
}
