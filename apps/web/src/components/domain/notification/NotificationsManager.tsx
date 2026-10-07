"use client";

import type { AppNotification,NotificationType } from "@/api/notifications";
import { Button } from "@/component/ui/button";
import { useNotifications } from "@/hook/use-notifications";
import { notificationDetailPath } from "@/lib/notification-path";
import { useAuthStore } from "@/zustand/auth";
import {
AlertTriangle,
Bell,
Check,
CheckCheck,
CreditCard,
DollarSign,
ExternalLink,
Info,
Package,
Trash2,
} from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { useRouter } from "next/navigation";
import { useEffect,useState } from "react";

interface NotificationsManagerProps {
  portalTitle: string;
  portalSubtitle: string;
  backHref?: string;
  backLabel?: string;
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case "ORDER_PLACED":
    case "ORDER_CONFIRMED":
    case "ORDER_SHIPPED":
    case "ORDER_DELIVERED":
    case "ORDER_CANCELLED":
      return <Package className="h-5 w-5 text-blue-500" />;
    case "PAYMENT_RECEIVED":
      return <CreditCard className="h-5 w-5 text-emerald-500" />;
    case "PAYMENT_FAILED":
      return <CreditCard className="h-5 w-5 text-rose-500" />;
    case "PAYOUT_PROCESSED":
      return <DollarSign className="h-5 w-5 text-amber-500" />;
    case "LOW_STOCK_ALERT":
      return <AlertTriangle className="h-5 w-5 text-orange-500" />;
    default:
      return <Info className="h-5 w-5 text-muted-foreground" />;
  }
}

const notificationTypeLabels: Record<NotificationType, string> = {
  ORDER_PLACED: "Order placed",
  ORDER_CONFIRMED: "Order confirmed",
  ORDER_SHIPPED: "Order shipped",
  ORDER_DELIVERED: "Order delivered",
  ORDER_CANCELLED: "Order cancelled",
  PAYMENT_RECEIVED: "Payment received",
  PAYMENT_FAILED: "Payment failed",
  PAYOUT_PROCESSED: "Payout processed",
  LOW_STOCK_ALERT: "Low stock",
  SYSTEM_ANNOUNCEMENT: "System announcement",
};

const categoryNotificationTypes = {
  orders: new Set<NotificationType>([
    "ORDER_PLACED",
    "ORDER_CONFIRMED",
    "ORDER_SHIPPED",
    "ORDER_DELIVERED",
    "ORDER_CANCELLED",
  ]),
  payments: new Set<NotificationType>([
    "PAYMENT_RECEIVED",
    "PAYMENT_FAILED",
    "PAYOUT_PROCESSED",
  ]),
};

function formatFullDate(dateString: string): string {
  const d = new Date(dateString);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function NotificationsManager({
  portalTitle,
  portalSubtitle,
  backHref,
  backLabel,
}: NotificationsManagerProps) {
  const router = useRouter();
  const role = useAuthStore((state) => state.role ?? state.user?.role ?? "user");
  const [filter, setFilter] = useState<"all" | "unread" | "orders" | "payments">("all");
  const {
    notifications,
    unreadCount,
    isLoading,
    sseRetryExhausted,
    hasNextPage,
    nextCursor,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    fetchNotifications,
    retryStream,
  } = useNotifications();

  useEffect(() => {
    void fetchNotifications(undefined, 20, false, {
      ...(filter === "unread" ? { unreadOnly: true } : {}),
      ...(filter === "orders" || filter === "payments" ? { category: filter } : {}),
    });
  }, [fetchNotifications, filter]);

  const filteredNotifications =
    filter === "orders" || filter === "payments"
      ? notifications.filter((notification) =>
          categoryNotificationTypes[filter].has(notification.type),
        )
      : notifications;

  const handleAction = async (notif: AppNotification) => {
    if (!notif.isRead) {
      await markAsRead(notif.id);
    }
    router.push(notificationDetailPath(role, notif.id));
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Bar with back link & SSE status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          {backHref && (
            <Link
              href={backHref}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2 inline-block"
            >
              ← Back to {backLabel || "Overview"}
            </Link>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {portalTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {portalSubtitle}
          </p>
        </div>
      </div>

      {sseRetryExhausted && (
        <div
          role="status"
          className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-muted-foreground">
            Live notification updates are unavailable. Your notification list is still accessible.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={retryStream}
          >
            Reconnect
          </Button>
        </div>
      )}

      {/* Action Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === "unread"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            Unread ({unreadCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("orders")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === "orders"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            Orders
          </button>
          <button
            type="button"
            onClick={() => setFilter("payments")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === "payments"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            Payments
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllAsRead()}
              className="gap-1.5 text-xs h-8"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all as read
            </Button>
          )}
          {notifications.some((n) => n.isRead) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearAll()}
              className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear read
            </Button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="mt-6 space-y-3">
        {isLoading && notifications.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 rounded-2xl bg-secondary/50 animate-pulse"
              />
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border py-16 px-4 text-center">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-base font-semibold text-foreground">
              No notifications found
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {filter === "unread"
                ? "You're all caught up! No unread messages."
                : "You don't have any notifications in this section yet."}
            </p>
          </div>
        ) : (
          filteredNotifications.map((notif) => (
            <div
              key={notif.id}
              role="link"
              tabIndex={0}
              onClick={() => handleAction(notif)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void handleAction(notif);
                }
              }}
              className={`group relative flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-5 rounded-2xl border transition-all ${
                !notif.isRead
                  ? "bg-card border-primary/20 shadow-xs"
                  : "bg-card/40 border-border/70 hover:border-border"
              }`}
            >
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary/80">
                  {getNotificationIcon(notif.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className={`text-sm font-semibold tracking-tight ${
                        !notif.isRead ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {notif.title}
                    </span>
                    {!notif.isRead && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground">
                        NEW
                      </span>
                    )}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-secondary-foreground">
                      {notificationTypeLabels[notif.type]}
                    </span>
                    {notif.priority === "URGENT" && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600">
                        URGENT
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto sm:ml-0">
                      {formatFullDate(notif.createdAt)}
                    </span>
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {notif.message}
                  </p>

                  {notif.actionUrl && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleAction(notif);
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                    >
                      View details <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 self-end sm:self-center shrink-0 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                {!notif.isRead && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      void markAsRead(notif.id);
                    }}
                    title="Mark as read"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteNotification(notif.id);
                  }}
                  title="Delete notification"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {hasNextPage && nextCursor && (
        <div className="mt-8 flex justify-center pb-8">
          <Button
            variant="outline"
            disabled={isLoading}
            onClick={() =>
              fetchNotifications(nextCursor, 20, true, {
                ...(filter === "unread" ? { unreadOnly: true } : {}),
                ...(filter === "orders" || filter === "payments"
                  ? { category: filter }
                  : {}),
              })
            }
            className="rounded-full px-6 py-2 text-xs font-semibold"
          >
            {isLoading ? "Loading..." : "Load More Notifications"}
          </Button>
        </div>
      )}
    </div>
  );
}
