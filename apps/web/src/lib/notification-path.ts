import type { AuthRole } from "@/zustand/auth";

export function notificationListPath(role: AuthRole): string {
  return (
    role === "admin"
      ? "/admin/notifications"
      : role === "vendor"
        ? "/vendor/notifications"
        : "/account/notifications"
  );
}

export function notificationDetailPath(
  role: AuthRole,
  notificationId: string,
): string {
  return `${notificationListPath(role)}/${encodeURIComponent(notificationId)}`;
}
