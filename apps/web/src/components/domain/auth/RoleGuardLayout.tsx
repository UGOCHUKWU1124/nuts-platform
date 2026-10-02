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
  const { isAuthenticated, isInitialized, role } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    // Wait for session hydration to complete before making any redirect decisions.
    // Without this, a page reload would see isAuthenticated=false before
    // hydrateFromCookies/fetchUser runs and incorrectly redirect to login.
    if (!isInitialized) return;

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
  }, [isAuthenticated, isInitialized, role, allow, router]);

  // Show nothing until the auth store has finished initializing
  if (!isInitialized) return null;

  if (!isAuthenticated) return null;
  if (!role || !allow.includes(role as Role)) return null;

  return <>{children}</>;
}
