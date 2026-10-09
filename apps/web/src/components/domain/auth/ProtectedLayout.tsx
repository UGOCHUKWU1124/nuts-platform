"use client";

import { RoleGuardLayout } from "./RoleGuardLayout";
import { type ReactNode } from "react";

export function ProtectedLayout({ children }: { children: ReactNode }) {
  return <RoleGuardLayout allow={["user"]}>{children}</RoleGuardLayout>;
}
