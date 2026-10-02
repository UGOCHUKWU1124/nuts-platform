"use client";

import { useAuthStore } from "@/zustand/auth";
import { useEffect } from "react";

export default function LogoutPage() {
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    const role = useAuthStore.getState().role;
    const target =
      role === "admin"
        ? "/auth/admin/login"
        : role === "vendor"
        ? "/auth/vendor/login"
        : "/";
    logout({ redirectTo: target });
  }, [logout]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Logging out...</p>
    </div>
  );
}

