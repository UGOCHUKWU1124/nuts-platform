"use client";

import { notificationsApi } from "@/api/notifications";
import { Button } from "@/component/ui/button";
import { queryKey } from "@/lib/query-key";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { notificationListPath } from "@/lib/notification-path";
import { useAuthStore } from "@/zustand/auth";
import { useNotificationsStore } from "@/zustand/notifications";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell, ExternalLink } from "lucide-react";
import Link from "@/components/navigation/AppLink";
import { useEffect, useRef } from "react";

export function NotificationDetail({ id }: { id: string }) {
  const user = useAuthStore((state) => state.user);
  const role = useAuthStore((state) => state.role ?? state.user?.role ?? "user");
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const notification = useQuery({
    queryKey: [...queryKey.notification.detail(`${role}:${user?.id ?? ""}`, id)],
    queryFn: async ({ signal }) => (await notificationsApi.getById(id, signal)).data,
    enabled: isAuthenticated && Boolean(user?.id && id),
  });
  const markAsRead = useNotificationsStore((state) => state.markAsRead);
  const backHref = notificationListPath(role);
  const item = notification.data;
  const markRequested = useRef<string | null>(null);

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

  if (notification.isPending) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (notification.isError || !item) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-destructive">
          Unable to load this notification. It may have been deleted or you may not have access.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={backHref}><ArrowLeft className="mr-2 h-4 w-4" />Notifications</Link>
        </Button>
      </main>
    );
  }

  const actionPath = safeInternalPath(item.actionUrl, "");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Button asChild variant="ghost" className="mb-6">
        <Link href={backHref}><ArrowLeft className="mr-2 h-4 w-4" />All notifications</Link>
      </Button>
      <article className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Bell className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                {item.type.replaceAll("_", " ")}
              </span>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                {item.priority}
              </span>
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">{item.title}</h1>
            <time className="mt-2 block text-sm text-muted-foreground" dateTime={item.createdAt}>
              {new Date(item.createdAt).toLocaleString()}
            </time>
            <p className="mt-6 whitespace-pre-wrap leading-relaxed text-foreground/90">
              {item.message}
            </p>
            {actionPath && (
              <Button asChild className="mt-6">
                <Link href={actionPath}>
                  Open related page <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
        {item.metadata && Object.keys(item.metadata).length > 0 && (
          <section className="mt-8 border-t border-border pt-5">
            <h2 className="text-sm font-semibold">Additional details</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {Object.entries(item.metadata).map(([key, value]) => (
                <div key={key} className="rounded-xl bg-secondary/50 p-3">
                  <dt className="text-xs font-medium capitalize text-muted-foreground">
                    {key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}
                  </dt>
                  <dd className="mt-1 break-words text-sm">
                    {typeof value === "string" ? value : JSON.stringify(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </article>
    </main>
  );
}
