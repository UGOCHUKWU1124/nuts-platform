"use client";

import { categoryService } from "@/api";
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
      const response = await categoryService.getAll();
      return Array.isArray(response.data) ? response.data : [];
    },
    initialData: hasInitial ? initialCategories : undefined,
    initialDataUpdatedAt: hasInitial ? () => Date.now() : undefined,
    enabled: !hasInitial,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
