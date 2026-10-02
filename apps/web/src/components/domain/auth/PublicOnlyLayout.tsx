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

  const content = (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl rounded-3xl border border-border/80 bg-card p-4 sm:p-6 shadow-sm">
        {children}
      </div>
    </div>
  );

  // Admin and Vendor auth pages should NOT render CustomerLayout with customer Navbar!
  if (isAdminAuth || isVendorAuth || !showNavigation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    );
  }

  return <CustomerLayout>{content}</CustomerLayout>;
}
