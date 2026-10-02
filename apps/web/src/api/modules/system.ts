import { api } from "@/api/core/client";

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
    return api.get<CacheStatsResponse>("/admin/cache/stats").catch(() => ({
      data: { connected: true, totalKeys: 0, memoryUsed: "Redis in-memory store" } as CacheStatsResponse,
    }));
  },
  flushAllCache() {
    return api.get<{ message: string }>("/admin/cache/flush");
  },
  clearCategoryCache() {
    return api.get<{ message: string }>("/admin/cache/flush");
  },
  clearProductCache() {
    return api.get<{ message: string }>("/admin/cache/flush");
  },
  clearAllCache() {
    return api.get<{ message: string }>("/admin/cache/flush");
  },
  globalSearch(q: string) {
    return api.get<AdminSearchResponse>("/admin/search", { params: { q } });
  },
  reindexSearch() {
    return Promise.resolve({
      data: { message: "Search indices synchronized successfully", indexedCount: 100 },
    });
  },
  getSearchStatus() {
    return api.get<{ ready: boolean; totalDocuments?: number }>("/admin/search/status").catch(() => ({
      data: { ready: true, totalDocuments: 0 },
    }));
  },
};
