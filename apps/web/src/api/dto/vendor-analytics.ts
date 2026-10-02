import type { OrderStatus } from "../core/types";

// ── Vendor analytics ────────────────────────────────────────────────────────

export interface VendorAnalyticsOrderStatusCountDto {
  status: OrderStatus;
  count: number;
}

export interface VendorDailyTrendDto {
  date: string;
  value: number;
}

export interface VendorTopProductDto {
  id: string;
  name: string;
  sku: string;
  totalSold: number;
  revenue: string;
  stock: number;
  isActive: boolean;
}

export interface VendorCustomerSummaryDto {
  totalBuyers: number;
  repeatBuyers: number;
  averageOrderValue: string;
}

export interface VendorRecentOrderDto {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: Date;
  itemCount: number;
}

export interface VendorAnalyticsSummaryDto {
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  totalVariants: number;
  totalOrders: number;
  newOrdersInPeriod: number;
  totalRevenue: string;
  revenueInPeriod: string;
  orderStatusCounts: VendorAnalyticsOrderStatusCountDto[];
  revenueTrend: VendorDailyTrendDto[];
  orderTrend: VendorDailyTrendDto[];
  topProducts?: VendorTopProductDto[];
  customers?: VendorCustomerSummaryDto;
  revenue: string;
  orderCount: number;
  productsSold: number;
  avgOrderValue: string;
  recentOrders?: VendorRecentOrderDto[];
  conversionRate: number;
}

export interface VendorQueryAnalyticsDto {
  range?: '7d' | '30d' | '90d' | '1y';
  startDate?: string;
  endDate?: string;
  top?: number;
  fromDate?: string;
  toDate?: string;
  includeTopProducts?: boolean;
  includeCustomers?: boolean;
}