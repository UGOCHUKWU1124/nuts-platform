"use client";

import { CustomerLayout } from "@/component/layout/CustomerLayout";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuthStore, normalizeRole } from "@/zustand/auth";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { Loader2 } from "lucide-react";

interface PublicOnlyLayoutProps {
  children: ReactNode;
  showNavigation?: boolean;
}

export function PublicOnlyLayout({
  children,
  showNavigation = true,
}: PublicOnlyLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, user, role } = useAuthStore();

  const isAdminAuth = pathname?.startsWith("/auth/admin");
  const isVendorAuth = pathname?.startsWith("/auth/vendor");

  useEffect(() => {
    if (!isAuthenticated) return;

    const activeRole = normalizeRole(role ?? user?.role);

    let redirectParam: string | null = null;
    if (typeof window !== "undefined") {
      redirectParam = new URLSearchParams(window.location.search).get("redirect");
    }

    let target = "/";
    if (activeRole === "admin" || isAdminAuth) {
      target = safeInternalPath(redirectParam, "/admin");
    } else if (activeRole === "vendor" || isVendorAuth) {
      target = safeInternalPath(redirectParam, "/vendor/analytic");
    } else {
      target = safeInternalPath(redirectParam, "/");
    }

    router.replace(target);
  }, [isAuthenticated, user, role, isAdminAuth, isVendorAuth, router]);

  // If already authenticated, show redirecting state rather than login form
  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs font-medium">Redirecting to your dashboard...</p>
        </div>
      </div>
    );
  }

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
