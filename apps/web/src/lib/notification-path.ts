export function notificationListPath(role?: string | null): string {
  const normalized = (role ?? "").toLowerCase();
  return (
    normalized === "admin"
      ? "/admin/notifications"
      : normalized === "vendor"
        ? "/vendor/notifications"
        : "/account/notifications"
  );
}

export function notificationDetailPath(
  role: string | null | undefined,
  notificationId: string,
): string {
  return `${notificationListPath(role)}/${encodeURIComponent(notificationId)}`;
}

