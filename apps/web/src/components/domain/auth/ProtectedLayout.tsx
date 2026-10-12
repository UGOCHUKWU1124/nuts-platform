import { type ReactNode } from "react";
import { enforceAuth } from "@/lib/server-auth.ts";

export async function ProtectedLayout({ children }: { children: ReactNode }) {
  await enforceAuth("user", "/auth/login");
  return <>{children}</>;
}
