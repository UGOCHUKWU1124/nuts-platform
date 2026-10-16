"use client";

import { notificationsApiForRole } from "@/api/notifications";
import { Button } from "@/component/ui/button";
import { ConfirmDialog } from "@/component/modal/ConfirmDialog";
import { queryKey } from "@/lib/query-key";
import {
  notificationListPath,
  resolveNotificationTargetUrl,
} from "@/lib/notification-path";
import { useAuthStore, normalizeRole } from "@/zustand/auth";
import { useNotificationsStore } from "@/zustand/notifications";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Package,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function NotificationDetail({ id }: { id: string }) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const rawRole = useAuthStore((state) => state.role ?? state.user?.role);
  const role = normalizeRole(rawRole) ?? "user";
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const notification = useQuery({
    queryKey: [...queryKey.notification.detail(`${role}:${user?.id ?? ""}`, id)],
    queryFn: async ({ signal }) =>
      (await notificationsApiForRole(role).getById(id, signal)).data,
    enabled: isAuthenticated && Boolean(user?.id && id),
  });

  const markAsRead = useNotificationsStore((state) => state.markAsRead);
  const deleteNotification = useNotificationsStore(
    (state) => state.deleteNotification,
  );
  const backHref = notificationListPath(role);
  const item = notification.data;
  const markRequested = useRef<string | null>(null);

  // Auto-mark as read on open
  useEffect(() => {
    if (
      notification.data &&
      !notification.data.isRead &&
      markRequested.current !== notification.data.id
    ) {
      markRequested.current = notification.data.id;
      void markAsRead(notification.data.id, true);
    }
  }, [notification.data, markAsRead]);

  const deleteMutation = useMutation({
    mutationFn: () => notificationsApiForRole(role).delete(id),
    onSuccess: () => {
      deleteNotification(id);
      toast.success("Notification deleted");
      router.push(backHref);
    },
    onError: () => {
      toast.error("Failed to delete notification");
    },
  });

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (notification.isPending) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        <div className="h-6 w-36 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  }

  if (notification.isError || !item) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-foreground">
          Notification Not Found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This notification could not be found or may have been deleted.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Notifications
          </Link>
        </Button>
      </main>
    );
  }

  // Resolve the true related target URL
  const actionPath = resolveNotificationTargetUrl(item, role);

  // Type-specific icon and accent styling
  const getTypeBadge = (type: string) => {
    if (type.includes("ORDER")) {
      return {
        icon: <ShoppingBag className="h-5 w-5 text-blue-500" />,
        bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
        label: type.replaceAll("_", " "),
      };
    }
    if (type.includes("PAYMENT") || type.includes("PAYOUT")) {
      return {
        icon: <CreditCard className="h-5 w-5 text-emerald-500" />,
        bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        label: type.replaceAll("_", " "),
      };
    }
    if (type.includes("ALERT") || type.includes("LOW_STOCK")) {
      return {
        icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
        bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        label: type.replaceAll("_", " "),
      };
    }
    return {
      icon: <Bell className="h-5 w-5 text-primary" />,
      bg: "bg-primary/10 text-primary border-primary/20",
      label: type.replaceAll("_", " "),
    };
  };

  const badgeInfo = getTypeBadge(item.type);

  // Priority color styling
  const priorityBadge = {
    URGENT: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
    HIGH: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
    MEDIUM: "bg-secondary text-secondary-foreground border-border",
    LOW: "bg-muted text-muted-foreground border-transparent",
  }[item.priority] || "bg-secondary text-secondary-foreground border-border";

  const orderId =
    (item.metadata?.orderId as string | undefined) ??
    (item.metadata?.order_id as string | undefined);
  const orderNumber = item.metadata?.orderNumber as string | undefined;
  const paymentId =
    (item.metadata?.paymentId as string | undefined) ??
    (item.metadata?.payment_id as string | undefined);

  const portalLabel =
    role === "admin"
      ? "Admin Portal"
      : role === "vendor"
        ? "Vendor Portal"
        : "Storefront Account";

  return (
    <main className="mx-auto max-w-3xl px-3 sm:px-6 py-6 sm:py-10 space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            Back to {portalLabel} Notifications
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsDeleteOpen(true)}
          className="text-muted-foreground hover:text-destructive h-8 w-8"
          title="Delete Notification"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Main Notification Card */}
      <article className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8 space-y-6">
        {/* Top Badges & Meta */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badgeInfo.bg}`}
            >
              {badgeInfo.icon}
              {badgeInfo.label}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${priorityBadge}`}
            >
              {item.priority} Priority
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <time dateTime={item.createdAt}>
              {new Date(item.createdAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
          </div>
        </div>

        {/* Title & Body Message */}
        <div className="space-y-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {item.title}
          </h1>
          <p className="whitespace-pre-wrap text-base text-foreground/85 leading-relaxed">
            {item.message}
          </p>
        </div>

        {/* Related Resource Action Card (Order / Payment) */}
        {(actionPath || orderId || paymentId) && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Package className="h-4 w-4" />
                  </span>
                  <span className="font-semibold text-sm text-foreground">
                    Associated {orderId ? "Order" : "Resource"}
                  </span>
                </div>
                {orderNumber && (
                  <p className="text-xs text-muted-foreground">
                    Order Reference:{" "}
                    <span className="font-mono font-bold text-foreground">
                      #{orderNumber}
                    </span>
                  </p>
                )}
              </div>

              {actionPath && (
                <Button asChild size="default" className="gap-2 font-semibold shadow-xs">
                  <Link href={actionPath}>
                    View {orderId ? "Order" : "Resource"} Details
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>

            {/* Quick Reference Copy Grid */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-primary/10 text-xs">
              {orderId && (
                <button
                  type="button"
                  onClick={() => handleCopy(orderId, "orderId")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/80 px-2.5 py-1 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  title="Click to copy ID"
                >
                  {copiedKey === "orderId" ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  ID: {orderId.slice(0, 8)}...
                </button>
              )}
              {paymentId && (
                <button
                  type="button"
                  onClick={() => handleCopy(paymentId, "paymentId")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/80 px-2.5 py-1 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  title="Click to copy payment ID"
                >
                  {copiedKey === "paymentId" ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  Payment: {paymentId.slice(0, 8)}...
                </button>
              )}
            </div>
          </div>
        )}

        {/* Additional Metadata Inspector (if available) */}
        {item.metadata &&
          Object.keys(item.metadata).filter(
            (k) => !["orderId", "order_id", "orderNumber", "paymentId"].includes(k),
          ).length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Event Metadata
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {Object.entries(item.metadata)
                  .filter(
                    ([k]) =>
                      !["orderId", "order_id", "orderNumber", "paymentId"].includes(k),
                  )
                  .map(([key, val]) => (
                    <div key={key} className="flex justify-between gap-2 p-1.5 rounded bg-background/60">
                      <span className="text-muted-foreground font-mono">{key}:</span>
                      <span className="font-medium text-foreground truncate">
                        {typeof val === "object" ? JSON.stringify(val) : String(val)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
      </article>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete Notification"
        description="Are you sure you want to remove this notification from your inbox? This cannot be undone."
        confirmText="Delete"
        isLoading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </main>
  );
}
