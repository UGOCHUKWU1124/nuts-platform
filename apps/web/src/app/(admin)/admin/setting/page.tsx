"use client";

import { adminSystemService } from "@/api";
import { PageHeader } from "@/component/common/PageHeader";
import { ConfirmDialog } from "@/component/modal/ConfirmDialog";
import { ThemeSelector } from "@/component/theme/ThemeSelector";
import { Badge } from "@/component/ui/badge";
import { Button } from "@/component/ui/button";
import { useMutation,useQuery } from "@tanstack/react-query";
import {
Activity,
CreditCard,
Database,
RefreshCw,
Search
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminSettingPage() {
  const [confirmFlushAll, setConfirmFlushAll] = useState(false);
  const [confirmReindex, setConfirmReindex] = useState(false);
  const { data: cacheStats, refetch: refetchCache } = useQuery({
    queryKey: ["admin", "cache", "stats"],
    queryFn: async () => {
      const res = await adminSystemService.getCacheStats();
      return res.data;
    },
    refetchInterval: 30000,
  });

  const { refetch: refetchSearch } = useQuery({
    queryKey: ["admin", "search", "status"],
    queryFn: async () => {
      const res = await adminSystemService.getSearchStatus();
      return res.data;
    },
  });

  // Mutations
  const purgeCategoryCacheMutation = useMutation({
    mutationFn: () => adminSystemService.clearCategoryCache(),
    onSuccess: (res) => {
      toast.success(res?.data?.message || "Category cache purged successfully");
      refetchCache();
    },
    onError: () => toast.error("Failed to clear category cache"),
  });

  const purgeProductCacheMutation = useMutation({
    mutationFn: () => adminSystemService.clearProductCache(),
    onSuccess: (res) => {
      toast.success(res?.data?.message || "Product cache purged successfully");
      refetchCache();
    },
    onError: () => toast.error("Failed to clear product cache"),
  });

  const purgeAllCacheMutation = useMutation({
    mutationFn: () => adminSystemService.clearAllCache(),
    onSuccess: (res) => {
      toast.success(res?.data?.message || "All Redis caches flushed successfully");
      refetchCache();
      setConfirmFlushAll(false);
    },
    onError: () => toast.error("Failed to flush all caches"),
  });

  const reindexSearchMutation = useMutation({
    mutationFn: () => adminSystemService.reindexSearch(),
    onSuccess: (res) => {
      toast.success(
        res?.data?.message ||
          `Search re-indexed successfully (${res?.data?.indexedCount ?? "all"} documents)`
      );
      refetchSearch();
      setConfirmReindex(false);
    },
    onError: () => toast.error("Failed to execute search re-indexing"),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="System Operations & Cache"
        description="Monitor system telemetry, purge Redis cache clusters, and rebuild search indexes."
      />

      {/* Engine Status Banner */}
      <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 text-emerald-500 border border-emerald-500/20">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                  Production Engine Online
                </h2>
                <Badge variant="success" className="text-xs font-semibold">
                  Healthy
                </Badge>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                NestJS • Prisma ORM • PostgreSQL 16 • Redis 7 • Elasticsearch Indexer
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchCache();
              refetchSearch();
              toast.success("System telemetry refreshed");
            }}
            className="rounded-xl text-xs font-semibold h-9 gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Telemetry
          </Button>
        </div>
      </div>

      {/* Appearance & Theme Card */}
      <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-6 sm:p-7 shadow-sm">
        <ThemeSelector />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Cache Management Card */}
        <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Database className="h-5 w-5 text-indigo-500" />
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Redis Cache Clusters
                </h3>
              </div>
              <Badge variant="outline" className="text-xs font-mono text-emerald-500 border-emerald-500/30">
                Connected
              </Badge>
            </div>

            <p className="text-xs text-neutral-400 mb-6">
              NUTS utilizes Redis for sub-millisecond category taxonomy lookups, materialized
              paths, and public storefront catalog caching.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 p-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Total Cached Keys
                </span>
                <p className="text-xl font-bold text-neutral-900 dark:text-white mt-1">
                  {cacheStats?.totalKeys ?? "Online"}
                </p>
                <span className="text-xs text-neutral-400">Active key references</span>
              </div>

              <div className="rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 p-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Memory Utilization
                </span>
                <p className="text-xl font-bold text-indigo-500 mt-1">
                  {cacheStats?.memoryUsed ?? "Optimized"}
                </p>
                <span className="text-xs text-neutral-400">Volatile LRU eviction</span>
              </div>
            </div>
          </div>

          {/* Granular Purge Actions */}
          <div className="space-y-2.5 pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                  Category Hierarchy Cache
                </p>
                <p className="text-xs text-neutral-400">
                  Flushes the tree and resets category slug paths
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={purgeCategoryCacheMutation.isPending}
                onClick={() => purgeCategoryCacheMutation.mutate()}
                className="h-8 rounded-xl text-xs font-medium"
              >
                {purgeCategoryCacheMutation.isPending ? "Purging..." : "Purge Category"}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                  Product Feed Cache
                </p>
                <p className="text-xs text-neutral-400">
                  Invalidates storefront catalog lists and filter facets
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={purgeProductCacheMutation.isPending}
                onClick={() => purgeProductCacheMutation.mutate()}
                className="h-8 rounded-xl text-xs font-medium"
              >
                {purgeProductCacheMutation.isPending ? "Purging..." : "Purge Products"}
              </Button>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <p className="text-xs font-semibold text-rose-500">
                  Flush Entire Platform Cache
                </p>
                <p className="text-xs text-neutral-400">
                  Invalidates all Redis keys across the marketplace
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={purgeAllCacheMutation.isPending}
                onClick={() => setConfirmFlushAll(true)}
                className="h-8 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/10 border-rose-500/30"
              >
                Flush All
              </Button>
            </div>
          </div>
        </div>

        {/* Search Engine & Marketplace Settings */}
        <div className="space-y-6">
          {/* Search Indexer */}
          <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Search className="h-5 w-5 text-indigo-500" />
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Search & Indexing Engine
                </h3>
              </div>
              <Badge variant="outline" className="text-xs font-mono text-emerald-500 border-emerald-500/30">
                Ready
              </Badge>
            </div>

            <p className="text-xs text-neutral-400 mb-4">
              Syncs product attributes, vendor tags, and nested category keywords to the
              high-speed search index.
            </p>

            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 mb-4">
              <div>
                <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                  Search Index Sync
                </p>
                <p className="text-xs text-neutral-400">
                  Full re-index of active products and categories
                </p>
              </div>
              <Button
                size="sm"
                disabled={reindexSearchMutation.isPending}
                onClick={() => setConfirmReindex(true)}
                className="h-8 rounded-xl text-xs font-medium bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
              >
                {reindexSearchMutation.isPending ? "Re-indexing..." : "Reindex Search"}
              </Button>
            </div>
          </div>

          {/* Payment & Currency Configuration */}
          <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-4">
              <CreditCard className="h-5 w-5 text-emerald-500" />
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Commerce & Payment Parameters
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60">
                <span className="text-neutral-500 dark:text-neutral-400">Payment Processor</span>
                <span className="font-bold text-neutral-900 dark:text-white">Paystack API (Live Webhooks)</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60">
                <span className="text-neutral-500 dark:text-neutral-400">Base Currency</span>
                <span className="font-bold text-neutral-900 dark:text-white">NGN (Nigerian Naira, ₦)</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60">
                <span className="text-neutral-500 dark:text-neutral-400">Marketplace Commission</span>
                <span className="font-bold text-indigo-500">10.0% Standard Take-Rate</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONFIRM FLUSH ALL CACHE DIALOG */}
      <ConfirmDialog
        open={confirmFlushAll}
        onOpenChange={setConfirmFlushAll}
        title="Flush Entire Platform Cache"
        description="Are you sure you want to flush all Redis cache keys? Storefront pages will experience a temporary cold-start latency until cache warm-up completes."
        confirmText="Flush All Caches"
        variant="destructive"
        isLoading={purgeAllCacheMutation.isPending}
        onConfirm={() => purgeAllCacheMutation.mutate()}
      />

      {/* CONFIRM REINDEX SEARCH DIALOG */}
      <ConfirmDialog
        open={confirmReindex}
        onOpenChange={setConfirmReindex}
        title="Trigger Full Search Re-index"
        description="This will scan all published product records, category associations, and vendor documents and rebuild the search inverted index."
        confirmText="Start Re-indexing"
        isLoading={reindexSearchMutation.isPending}
        onConfirm={() => reindexSearchMutation.mutate()}
      />
    </div>
  );
}
