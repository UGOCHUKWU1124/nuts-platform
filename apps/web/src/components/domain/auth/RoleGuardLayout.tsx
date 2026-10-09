"use client";

import { useAuthStore } from "@/zustand/auth";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

type Role = "user" | "admin" | "vendor";

function hasActiveSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith("session_active="));
}

export function RoleGuardLayout({
  allow,
  children,
}: {
  allow: Role[];
  children: ReactNode;
}) {
  const { isAuthenticated, isInitialized, role, status, hydrateFromCookies } =
    useAuthStore();
  const router = useRouter();

  const isHydrating =
    !isInitialized ||
    status === "hydrating" ||
    status === "unknown";

  useEffect(() => {
    // Wait for session hydration to complete before making any redirect decisions.
    if (isHydrating || status === "unavailable") return;

    if (!isAuthenticated) {
      // If a session cookie is present, do not redirect while hydration catches up
      if (hasActiveSessionCookie()) return;

      if (allow.includes("admin")) {
        router.replace("/auth/admin/login");
      } else if (allow.includes("vendor")) {
        router.replace("/auth/vendor/login");
      } else {
        router.replace("/auth/login");
      }
    } else if (role && !allow.includes(role as Role)) {
      if (role === "admin") {
        router.replace("/admin");
      } else if (role === "vendor") {
        router.replace("/vendor/analytic");
      } else {
        router.replace("/");
      }
    }
  }, [isAuthenticated, isHydrating, isInitialized, role, status, allow, router]);

  // Show nothing while hydrating or while a cookie session is being verified
  if (isHydrating || (!isAuthenticated && hasActiveSessionCookie())) {
    return null;
  }

  if (status === "unavailable") {
    return (
      <main className="flex min-h-[50svh] items-center justify-center px-4">
        <section
          role="alert"
          className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm"
        >
          <h1 className="text-lg font-semibold text-foreground">
            Can’t verify your session
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Authentication is temporarily unavailable. Your session has not been
            signed out.
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

  if (!isAuthenticated) return null;
  if (!role || !allow.includes(role as Role)) return null;

  return <>{children}</>;
}
