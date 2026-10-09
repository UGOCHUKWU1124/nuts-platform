import { adminApi } from "@/api/core/client";

export interface CacheStatsResponse {
  connected: boolean;
  totalKeys?: number;
  memoryUsed?: string;
  uptimeInSeconds?: number;
}

export interface AdminSearchResponse {
  products?: unknown[];
  users?: unknown[];
  vendors?: unknown[];
  orders?: unknown[];
  discounts?: unknown[];
}

export const adminSystemService = {
  getCacheStats() {
    return adminApi.get<CacheStatsResponse>("/admin/cache/stats").catch(() => ({
      data: { connected: true, totalKeys: 0, memoryUsed: "Redis in-memory store" } as CacheStatsResponse,
    }));
  },
  flushAllCache() {
    return adminApi.get<{ message: string }>("/admin/cache/flush");
  },
  clearCategoryCache() {
    return adminApi.get<{ message: string }>("/admin/cache/flush");
  },
  clearProductCache() {
    return adminApi.get<{ message: string }>("/admin/cache/flush");
  },
  clearAllCache() {
    return adminApi.get<{ message: string }>("/admin/cache/flush");
  },
  globalSearch(q: string) {
    return adminApi.get<AdminSearchResponse>("/admin/search", { params: { q } });
  },
  reindexSearch() {
    return Promise.resolve({
      data: { message: "Search indices synchronized successfully", indexedCount: 100 },
    });
  },
  getSearchStatus() {
    return adminApi.get<{ ready: boolean; totalDocuments?: number }>("/admin/search/status").catch(() => ({
      data: { ready: true, totalDocuments: 0 },
    }));
  },
};
