"use client";

import { useAuthStore } from "@/zustand/auth";

export function useAuthSession() {
  const { user, role, isAuthenticated, isLoading, isInitialized } = useAuthStore();
  return { user, role, isAuthenticated, isLoading, isInitialized };
}

export function useAuth() {
  return useAuthStore();
}

export function useUser() {
  const user = useAuthStore((s) => s.user);
  return { user };
}
