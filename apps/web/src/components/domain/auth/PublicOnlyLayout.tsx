"use client";

import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

interface PublicOnlyLayoutProps {
  children: ReactNode;
  showNavigation?: boolean;
}

export function PublicOnlyLayout({
  children,
  showNavigation = true,
}: PublicOnlyLayoutProps) {
  const pathname = usePathname();

  const isAdminAuth = pathname?.startsWith("/auth/admin");
  const isVendorAuth = pathname?.startsWith("/auth/vendor");

  // Admin and Vendor auth pages should NOT render CustomerLayout with customer Navbar!
  if (isAdminAuth || isVendorAuth || !showNavigation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-3 py-6 sm:px-6 sm:py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    );
  }

  return (
    <CustomerLayout>
      <div className="mx-auto w-full max-w-xl px-3 py-6 sm:px-6 sm:py-10">
        {children}
      </div>
    </CustomerLayout>
  );
}
