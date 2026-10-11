"use client";


import type { CategoryResponseDto } from "@/api/dto/category";
import { queryKey } from "@/lib/query-key";
import { useQuery } from "@tanstack/react-query";


export function usePublicCategories(
  initialCategories?: CategoryResponseDto[],
) {
  const hasInitial = Boolean(initialCategories && initialCategories.length > 0);

  return useQuery({
    queryKey: queryKey.category.list(),
    queryFn: async () => {
      return [];
    },
    initialData: hasInitial ? initialCategories : undefined,
    initialDataUpdatedAt: hasInitial ? () => Date.now() : undefined,
    enabled: false,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
