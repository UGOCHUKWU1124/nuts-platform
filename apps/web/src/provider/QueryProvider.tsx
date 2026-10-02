"use client";

import { queryClient } from "@/lib/query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" &&
        process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true" && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
    </QueryClientProvider>
  );
}
