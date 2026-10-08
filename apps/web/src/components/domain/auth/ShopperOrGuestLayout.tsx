"use client";

import { useAuthStore } from "@/zustand/auth";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/**
 * Route guard for customer shopping pages (Cart, Wishlist).
 * - Allows unauthenticated guests (who can browse/view guest cart/wishlist).
 * - Allows authenticated shoppers (role: 'user', canPurchase: true).
 * - Forbids and cleanly redirects authenticated merchants/admins to their workspaces.
 */
export function ShopperOrGuestLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isInitialized, role, status, capabilities } = useAuthStore();
  const router = useRouter();

  const isHydrating = !isInitialized || status === "hydrating" || status === "unknown";

  useEffect(() => {
    if (isHydrating || !isAuthenticated) return;

    if (capabilities?.canSell || role === "vendor") {
      router.replace("/vendor/analytic");
    } else if (capabilities?.canAdminister || role === "admin") {
      router.replace("/admin");
    }
  }, [isAuthenticated, isHydrating, role, capabilities, router]);

  if (isAuthenticated && (role === "vendor" || role === "admin" || (capabilities && !capabilities.canPurchase))) {
    return null;
  }

  return <>{children}</>;
}
