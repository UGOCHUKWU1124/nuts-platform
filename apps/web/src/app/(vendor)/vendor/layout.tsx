import { VendorLayout } from "@/component/layout/VendorLayout";
import { enforceAuth } from "@/lib/server-auth.ts";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await enforceAuth("vendor", "/auth/vendor/login");
  return <VendorLayout>{children}</VendorLayout>;
}
