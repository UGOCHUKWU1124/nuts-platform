"use client";

import { useAuthStore } from "@/zustand/auth";
import { useHydrated } from "../../../hook/use-hydrated";
import { useRouter } from "next/navigation";
import { useEffect,type ReactNode } from "react";

function hasUserSessionCookie() {
  if (typeof document === "undefined") return false;

  const cookies = document.cookie.split(";").map((cookie) => cookie.trim());
  return cookies.some(
    (cookie) =>
      cookie.startsWith("user_session=") ||
      cookie.startsWith("user_access_token=") ||
      cookie.startsWith("user_refresh_token=")
  );
}

export function ProtectedLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const isReady = useHydrated();

  useEffect(() => {
    if (!isReady) return;

    const hasSession = isAuthenticated || hasUserSessionCookie();

    if (!hasSession) {
      router.replace("/auth/login");
    }
  }, [isAuthenticated, isReady, router]);

  if (!isReady) return null;
  if (!isAuthenticated && !hasUserSessionCookie()) return null;

  return <>{children}</>;
}
