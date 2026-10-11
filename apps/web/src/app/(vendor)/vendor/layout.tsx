import { VendorLayout } from "@/component/layout/VendorLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <VendorLayout>{children}</VendorLayout>;
}
