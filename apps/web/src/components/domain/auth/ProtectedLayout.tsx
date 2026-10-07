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
  const { isAuthenticated, status, hydrateFromCookies } = useAuthStore();
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
  if (status === "unavailable") {
    return (
      <main className="flex min-h-[50svh] items-center justify-center px-4">
        <section role="alert" className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Can’t verify your session</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Authentication is temporarily unavailable. Your session has not been signed out.
          </p>
          <button
            type="button"
            onClick={() => void hydrateFromCookies()}
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }
  if (!isAuthenticated && !hasUserSessionCookie()) return null;

  return <>{children}</>;
}
