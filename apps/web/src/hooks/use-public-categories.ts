"use client";

import { categoryService } from "@/api";
import type { CategoryResponseDto } from "@/api/dto/category";
import { queryKey } from "@/lib/query-key";
import { useQuery } from "@tanstack/react-query";

const CATEGORY_STALE_TIME = 1000 * 60 * 10;
const CATEGORY_GC_TIME = 1000 * 60 * 60;

export function usePublicCategories(
  initialCategories?: CategoryResponseDto[],
) {
  return useQuery({
    queryKey: queryKey.category.list(),
    queryFn: async () => {
      const response = await categoryService.getAll();
      return Array.isArray(response.data) ? response.data : [];
    },
    initialData: initialCategories?.length ? initialCategories : undefined,
    staleTime: CATEGORY_STALE_TIME,
    gcTime: CATEGORY_GC_TIME,
  });
}
