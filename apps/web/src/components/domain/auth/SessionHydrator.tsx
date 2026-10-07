"use client";

import { useAuthStore } from "@/zustand/auth";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Initializes tab-local UI state via idempotent authBootstrap without duplicate /me requests.
 * Tracks Next.js route changes at runtime so each portal uses its own session context.
 */
export function SessionHydrator({ children }: { children: React.ReactNode }) {
  const hydrateFromCookies = useAuthStore((state) => state.hydrateFromCookies);
  const syncActiveRole = useAuthStore((state) => state.syncActiveRole);
  const pathname = usePathname();

  useEffect(() => {
    try {
      window.sessionStorage.removeItem("nuts-auth-storage");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "SecurityError")) {
        throw error;
      }
    }
  }, []);

  useEffect(() => {
    syncActiveRole();
    hydrateFromCookies();
  }, [pathname, syncActiveRole, hydrateFromCookies]);

  return <>{children}</>;
}