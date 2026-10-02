"use client";

import { NotificationsManager } from "@/component/notification/NotificationsManager";

export default function AdminNotificationsPage() {
  return (
    <NotificationsManager
      portalTitle="System Operations Notifications"
      portalSubtitle="Real-time administrative feed for platform orders, payment alerts, and security events."
      backHref="/admin"
      backLabel="Admin Console"
    />
  );
}
