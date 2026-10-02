"use client";

import { adminAnalyticsService } from "@/api/analytics";
import { PageHeader,StatCard } from "@/component/common/PageHeader";
import { Badge } from "@/component/ui/badge";
import { formatPrice } from "@/lib/util";
import { useQuery } from "@tanstack/react-query";
import {
CreditCard,
Layers,
ShoppingBag,
Sparkles,
UserCheck,
Users
} from "lucide-react";
import { useState } from "react";

type TimePeriod = "7d" | "30d" | "90d" | "1y";

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<TimePeriod>("30d");

  const queryParams = {
    range: period,
    top: 10,
  };

  const { data: summary } = useQuery({
    queryKey: ["admin", "analytics", "summary", period],
    queryFn: async () => {
      const res = await adminAnalyticsService.summary(queryParams);
      return res.data;
    },
  });

  const { data: topProducts = [] } = useQuery({
    queryKey: ["admin", "analytics", "topProducts", period],
    queryFn: async () => {
      const res = await adminAnalyticsService.topProducts(queryParams);
      return res.data;
    },
  });

  const { data: topVendors = [] } = useQuery({
    queryKey: ["admin", "analytics", "topVendors", period],
    queryFn: async () => {
      const res = await adminAnalyticsService.topVendors(queryParams);
      return res.data;
    },
  });

  const { data: topCategories = [] } = useQuery({
    queryKey: ["admin", "analytics", "topCategories", period],
    queryFn: async () => {
      const res = await adminAnalyticsService.topCategories(queryParams);
      return res.data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["admin", "analytics", "payments", period],
    queryFn: async () => {
      const res = await adminAnalyticsService.payments(queryParams);
      return res.data;
    },
  });

  const { data: discounts } = useQuery({
    queryKey: ["admin", "analytics", "discounts", period],
    queryFn: async () => {
      const res = await adminAnalyticsService.discounts(queryParams);
      return res.data;
    },
  });

  const s = summary;
  const grossRev = Number(s?.revenueInPeriod || s?.totalRevenue || 0);

  return (
    <div className="space-y-8">
      {/* Page Title & Time Window Switcher */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Executive Analytics"
          description="Holistic performance metrics, cross-marketplace volume, and transaction audits."
        />

        {/* Luxury Time Period Selector */}
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
              onClick={() => setPeriod(t.id)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                period === t.id
                  ? "bg-neutral-900 text-white shadow-xs dark:bg-white dark:text-neutral-950"
                  : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Platform Revenue"
          value={formatPrice(grossRev)}
          subtitle={`${s?.newOrdersInPeriod ?? s?.totalOrders ?? 0} settled transactions`}
        />
        <StatCard
          title="Total Orders"
          value={s?.totalOrders ?? 0}
          subtitle={`${s?.newOrdersInPeriod ?? 0} in selected window`}
          icon={<ShoppingBag className="h-5 w-5 text-emerald-500" />}
        />
        <StatCard
          title="Verified Vendors"
          value={s?.verifiedVendors ?? s?.totalVendors ?? 0}
          subtitle={`${s?.activeVendors ?? 0} active merchants`}
          icon={<UserCheck className="h-5 w-5 text-violet-500" />}
        />
        <StatCard
          title="Registered Buyers"
          value={s?.totalUsers ?? 0}
          subtitle={`${s?.newUsersInPeriod ?? 0} newly registered`}
          icon={<Users className="h-5 w-5 text-blue-500" />}
        />
      </div>

      {/* Secondary Metrics Bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Catalog Products
          </span>
          <p className="text-xl font-bold text-neutral-900 dark:text-white mt-1">
            {s?.totalProducts ?? 0}
          </p>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {s?.totalVariants ?? 0} variant options
          </span>
        </div>

        <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Payment Success Rate
          </span>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {payments?.successRate !== undefined ? `${payments.successRate.toFixed(1)}%` : "N/A"}
          </p>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {payments?.failedPayments ?? 0} failed / abandoned
          </span>
        </div>

        <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Active Discount Codes
          </span>
          <p className="text-xl font-bold text-neutral-900 dark:text-white mt-1">
            {discounts?.activeCodes ?? s?.totalDiscountCodes ?? 0}
          </p>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {discounts?.totalUsages ?? 0} total redemptions
          </span>
        </div>

        <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Orders Fulfilled
          </span>
          <p className="text-xl font-bold text-neutral-900 dark:text-white mt-1">
            {s?.orderStatusCounts?.find((c) => c.status === "DELIVERED")?.count ?? 0}
          </p>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {s?.orderStatusCounts?.find((c) => c.status === "PROCESSING")?.count ?? 0} in processing
          </span>
        </div>
      </div>

      {/* Grid: Top Products Leaderboard & Top Vendors */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Selling Products */}
        <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Top Selling Products
              </h2>
              <p className="text-xs text-neutral-400">
                Highest grossing inventory in selected window
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              Leaderboard
            </Badge>
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-neutral-800/80 overflow-hidden">
            {topProducts.length === 0 ? (
              <p className="py-8 text-center text-xs text-neutral-400">
                No product transactions recorded for this period.
              </p>
            ) : (
              topProducts.slice(0, 5).map((p, idx) => (
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
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Performing Vendors */}
        <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-indigo-500" />
                Top Performing Vendors
              </h2>
              <p className="text-xs text-neutral-400">
                Merchants driving maximum platform volume
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              Merchants
            </Badge>
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-neutral-800/80 overflow-hidden">
            {topVendors.length === 0 ? (
              <p className="py-8 text-center text-xs text-neutral-400">
                No vendor revenue recorded for this period.
              </p>
            ) : (
              topVendors.slice(0, 5).map((c, idx) => (
                <div key={c.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-white">
                        {c.storeName}
                      </p>
                      <span className="text-xs text-neutral-400">
                        {c.totalOrders} orders • {c.productCount} active listings
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                      {formatPrice(Number(c.revenue))}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Categories & Payment Breakdown Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Categories */}
        <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-500" />
                Category Performance
              </h2>
              <p className="text-xs text-neutral-400">
                Revenue contribution by taxonomy node
              </p>
            </div>
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-neutral-800/80 overflow-hidden">
            {topCategories.length === 0 ? (
              <p className="py-8 text-center text-xs text-neutral-400">
                No category sales recorded yet.
              </p>
            ) : (
              topCategories.slice(0, 5).map((cat) => (
                <div key={cat.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-white">
                      {cat.name}
                    </p>
                    <span className="text-xs font-mono text-neutral-400">
                      /{cat.slug} • {cat.productCount} products
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                      {formatPrice(Number(cat.revenue))}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Payment Health Card */}
        <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#121214] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-violet-500" />
                Payment Gateway Health
              </h2>
              <p className="text-xs text-neutral-400">
                Live Paystack transaction throughput
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-500 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Gateway Healthy
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 p-3.5">
              <span className="text-xs uppercase font-semibold text-neutral-400">
                Successful Payments
              </span>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {payments?.successfulPayments ?? s?.totalOrders ?? 0}
              </p>
            </div>
            <div className="rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 p-3.5">
              <span className="text-xs uppercase font-semibold text-neutral-400">
                Failed Attempts
              </span>
              <p className="text-lg font-bold text-rose-500 mt-0.5">
                {payments?.failedPayments ?? 0}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-100 dark:border-neutral-800 p-4 space-y-2 text-xs">
            <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
              <span>Total Transactions Processed</span>
              <span className="font-semibold text-neutral-900 dark:text-white">
                {payments?.totalPayments ?? s?.totalOrders ?? 0}
              </span>
            </div>
            <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
              <span>Refunded Volume</span>
              <span className="font-semibold text-rose-500">
                {formatPrice(Number(payments?.refundedAmount ?? 0))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
