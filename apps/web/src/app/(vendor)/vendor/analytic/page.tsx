"use client";

import { vendorAnalyticsService } from "@/api";
import { PageHeader,StatCard } from "@/component/common/PageHeader";
import { Badge } from "@/component/ui/badge";
import { queryKey } from "@/lib/query-key";
import { formatPrice } from "@/lib/util";
import { useQuery } from "@tanstack/react-query";
import {
Repeat,
ShoppingBag,
Sparkles,
Users
} from "lucide-react";
import { useState } from "react";

type TimeRange = "7d" | "30d" | "90d" | "1y";

export default function VendorAnalyticPage() {
  const [range, setRange] = useState<TimeRange>("30d");

  const { data: s, isLoading } = useQuery({
    queryKey: [...queryKey.vendor.analytic, range],
    queryFn: async () => {
      const res = await vendorAnalyticsService.summary({
        range,
        top: 10,
      });
      return res.data;
    },
  });

  const periodRevenue = Number(s?.revenueInPeriod ?? 0);
  const totalRevenue = Number(s?.totalRevenue ?? 0);
  const ordersInPeriod = s?.newOrdersInPeriod ?? 0;
  const totalOrders = s?.totalOrders ?? 0;
  const aov = Number(s?.customers?.averageOrderValue ?? 0);
  const totalBuyers = s?.customers?.totalBuyers ?? 0;
  const repeatBuyers = s?.customers?.repeatBuyers ?? 0;

  return (
    <div className="space-y-8">
      {/* Header and Time Window Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Vendor Store Analytics"
          description="Real-time sales velocity, order metrics, inventory health, and buyer demographics."
        />

        <div className="flex items-center gap-1 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 p-1 shadow-xs backdrop-blur-md self-start sm:self-auto">
          {(
            [
              { id: "7d", label: "7 Days" },
              { id: "30d", label: "30 Days" },
              { id: "90d", label: "90 Days" },
              { id: "1y", label: "1 Year" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setRange(t.id)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                range === t.id
                  ? "bg-neutral-900 text-white shadow-xs dark:bg-white dark:text-neutral-950"
                  : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Real Server KPI Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Period Revenue"
          value={isLoading ? "..." : formatPrice(periodRevenue)}
          subtitle={`Across ${ordersInPeriod} orders in this window`}
        />
        <StatCard
          title="All-Time Revenue"
          value={isLoading ? "..." : formatPrice(totalRevenue)}
          subtitle={`${totalOrders} total orders processed`}
        />
        <StatCard
          title="Average Order Value"
          value={isLoading ? "..." : formatPrice(aov)}
          subtitle="Mean basket size per checkout"
          icon={<ShoppingBag className="h-5 w-5 text-violet-500" />}
        />
        <StatCard
          title="Customer Buyers"
          value={isLoading ? "..." : totalBuyers}
          subtitle={`${repeatBuyers} repeat customers`}
          icon={<Users className="h-5 w-5 text-blue-500" />}
        />
      </div>

      {/* Inventory & Stock Health Snapshot */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Active Listings
          </span>
          <p className="text-xl font-bold text-neutral-900 dark:text-white mt-1">
            {s?.activeProducts ?? 0}
          </p>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {s?.totalProducts ?? 0} total products listed
          </span>
        </div>

        <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Low Stock Alerts
          </span>
          <p className="text-xl font-bold text-amber-500 mt-1">
            {s?.lowStockProducts ?? 0}
          </p>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Inventory critically low
          </span>
        </div>

        <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Out of Stock
          </span>
          <p className="text-xl font-bold text-rose-500 mt-1">
            {s?.outOfStockProducts ?? 0}
          </p>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Requires inventory restock
          </span>
        </div>

        <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Total Variants
          </span>
          <p className="text-xl font-bold text-indigo-500 mt-1">
            {s?.totalVariants ?? 0}
          </p>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            SKUs across all listings
          </span>
        </div>
      </div>

      {/* Grid: Top Selling Items + Order Fulfillment Status Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Selling Products */}
        <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Top Performing Products
              </h2>
              <p className="text-xs text-neutral-400">
                Products ranked by revenue generated
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              Live Data
            </Badge>
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-neutral-800/80 overflow-hidden">
            {!s?.topProducts || s.topProducts.length === 0 ? (
              <p className="py-8 text-center text-xs text-neutral-400">
                No product sales recorded in this period.
              </p>
            ) : (
              s.topProducts.map((p, idx) => (
                <div key={p.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-white truncate max-w-[200px] sm:max-w-xs">
                        {p.name}
                      </p>
                      <span className="text-xs font-mono text-neutral-400">
                        {p.sku} • {p.totalSold} sold
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                      {formatPrice(Number(p.revenue))}
                    </p>
                    <span className="text-xs text-neutral-400">
                      {p.stock} in stock
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Order Status Breakdown & Buyer Retention */}
        <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-500" />
                  Buyer Engagement & Orders
                </h2>
                <p className="text-xs text-neutral-400">
                  Customer retention and fulfillment breakdown
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 p-3.5">
                <span className="text-xs uppercase font-semibold text-neutral-400 flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Unique Buyers
                </span>
                <p className="text-lg font-bold text-neutral-900 dark:text-white mt-1">
                  {totalBuyers}
                </p>
              </div>

              <div className="rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 p-3.5">
                <span className="text-xs uppercase font-semibold text-neutral-400 flex items-center gap-1">
                  <Repeat className="h-3 w-3 text-indigo-500" />
                  Repeat Buyers
                </span>
                <p className="text-lg font-bold text-indigo-500 mt-1">
                  {repeatBuyers}
                </p>
              </div>
            </div>

            {/* Order Status Counts */}
            <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3 block">
                Fulfillment Status Breakdown
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {!s?.orderStatusCounts || s.orderStatusCounts.length === 0 ? (
                  <p className="text-xs text-neutral-400 py-2 col-span-3">No orders recorded yet.</p>
                ) : (
                  s.orderStatusCounts.map((sc) => (
                    <div
                      key={sc.status}
                      className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/40 text-xs flex flex-col"
                    >
                      <span className="text-xs text-neutral-400 uppercase font-semibold">
                        {sc.status}
                      </span>
                      <span className="text-base font-bold text-neutral-900 dark:text-white mt-0.5">
                        {sc.count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

