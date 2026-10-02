"use client";

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 1,
      retryDelay: (attempt) => Math.min(250 * 2 ** attempt, 1000),
      refetchOnWindowFocus: false,
      // Reuse fresh route data immediately; refresh stale data in the background.
      refetchOnMount: true,
      refetchOnReconnect: true,
    },
  },
});
