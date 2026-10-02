import { RoleGuardLayout } from "@/component/auth/RoleGuardLayout";
import { AdminLayout } from "@/component/layout/AdminLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuardLayout allow={["admin"]}>
      <AdminLayout>{children}</AdminLayout>
    </RoleGuardLayout>
  );
}
