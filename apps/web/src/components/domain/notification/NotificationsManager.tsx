"use client";

import type { AppNotification,NotificationType } from "@/api/notifications";
import { Button } from "@/component/ui/button";
import { useNotifications } from "@/hook/use-notifications";
import { safeInternalPath } from "@/lib/safe-internal-path";
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
import Link from "next/link";
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
    case "PAYOUT_PROCESSED":
      return <DollarSign className="h-5 w-5 text-amber-500" />;
    case "LOW_STOCK_ALERT":
      return <AlertTriangle className="h-5 w-5 text-orange-500" />;
    default:
      return <Info className="h-5 w-5 text-muted-foreground" />;
  }
}

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
  const [filter, setFilter] = useState<"all" | "unread" | "orders" | "payments">("all");
  const {
    notifications,
    unreadCount,
    isLoading,
    hasNextPage,
    nextCursor,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    fetchNotifications,
  } = useNotifications();

  useEffect(() => {
    void fetchNotifications(undefined, 20);
  }, [fetchNotifications]);

  const filteredNotifications = notifications.filter((item) => {
    if (filter === "unread") return !item.isRead;
    if (filter === "orders") {
      return [
        "ORDER_PLACED",
        "ORDER_CONFIRMED",
        "ORDER_SHIPPED",
        "ORDER_DELIVERED",
        "ORDER_CANCELLED",
      ].includes(item.type);
    }
    if (filter === "payments") {
      return ["PAYMENT_RECEIVED", "PAYOUT_PROCESSED"].includes(
        item.type
      );
    }
    return true;
  });

  const handleAction = async (notif: AppNotification) => {
    if (!notif.isRead) {
      await markAsRead(notif.id);
    }
    const actionPath = safeInternalPath(notif.actionUrl, "");
    if (actionPath) router.push(actionPath);
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
                      onClick={() => handleAction(notif)}
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
                    onClick={() => markAsRead(notif.id)}
                    title="Mark as read"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteNotification(notif.id)}
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
            onClick={() => fetchNotifications(nextCursor, 20, true)}
            className="rounded-full px-6 py-2 text-xs font-semibold"
          >
            {isLoading ? "Loading..." : "Load More Notifications"}
          </Button>
        </div>
      )}
    </div>
  );
}
