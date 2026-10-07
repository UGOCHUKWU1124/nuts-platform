"use client";

import { useAuthStore } from "@/zustand/auth";
import { useRouter } from "next/navigation";
import { useEffect,type ReactNode } from "react";

type Role = "user" | "admin" | "vendor";

export function RoleGuardLayout({
  allow,
  children,
}: {
  allow: Role[];
  children: ReactNode;
}) {
  const { isAuthenticated, isInitialized, role, status, hydrateFromCookies } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    // Wait for session hydration to complete before making any redirect decisions.
    // Without this, a page reload would see isAuthenticated=false before
    // hydrateFromCookies/fetchUser runs and incorrectly redirect to login.
    if (!isInitialized || status === "unavailable") return;

    if (!isAuthenticated) {
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
  }, [isAuthenticated, isInitialized, role, status, allow, router]);

  // Show nothing until the auth store has finished initializing
  if (!isInitialized) return null;

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

  if (!isAuthenticated) return null;
  if (!role || !allow.includes(role as Role)) return null;

  return <>{children}</>;
}
