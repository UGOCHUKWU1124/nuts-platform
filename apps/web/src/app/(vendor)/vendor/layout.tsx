import { RoleGuardLayout } from "@/component/auth/RoleGuardLayout";
import { VendorLayout } from "@/component/layout/VendorLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuardLayout allow={["vendor"]}>
      <VendorLayout>{children}</VendorLayout>
    </RoleGuardLayout>
  );
}
