"use client";

import { useAuthStore } from "@/zustand/auth";
import { useEffect } from "react";

/**
 * Initializes tab-local UI state via idempotent authBootstrap without duplicate /me requests.
 * Uses window location runtime listeners inside useEffect to avoid blocking Next.js static prerendering.
 */
export function SessionHydrator({ children }: { children: React.ReactNode }) {
  const hydrateFromCookies = useAuthStore((state) => state.hydrateFromCookies);
  const syncActiveRole = useAuthStore((state) => state.syncActiveRole);

  useEffect(() => {
    syncActiveRole();
    hydrateFromCookies();

    const handleLocationChange = () => {
      syncActiveRole();
      hydrateFromCookies();
    };

    window.addEventListener("popstate", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, [syncActiveRole, hydrateFromCookies]);

  return <>{children}</>;
}