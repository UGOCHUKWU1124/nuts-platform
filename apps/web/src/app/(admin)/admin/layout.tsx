import { AdminLayout } from "@/component/layout/AdminLayout";
import { enforceAuth } from "@/lib/server-auth.ts";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await enforceAuth("admin", "/auth/admin/login");
  return <AdminLayout>{children}</AdminLayout>;
}
