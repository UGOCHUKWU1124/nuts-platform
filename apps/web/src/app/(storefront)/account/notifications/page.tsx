import { NotificationsManager } from "@/component/notification/NotificationsManager";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account Notifications | NUTS-P Marketplace",
  description:
    "Stay updated on order status, deliveries, promotions, and account security.",
};

export default function AccountNotificationsPage() {
  return (
    <NotificationsManager
      portalTitle="Account Notifications"
      portalSubtitle="Stay updated on order status, deliveries, promotions, and account security."
      backHref="/account"
      backLabel="Account"
    />
  );
}
