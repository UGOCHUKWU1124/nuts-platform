import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '@api/modules/infrastructure/prisma/prisma.service';
import { parseDateRange } from '@api/modules/shared/utils/date-range.util';
import {
  RANGE_DAYS,
  VendorAnalyticsQueryDto,
} from './dto/vendor-analytics-query.dto';
import {
  VendorAnalyticsSummaryDto,
  VendorDailyTrendDto,
} from './dto/vendor-analytics-summary.dto';

@Injectable()
export class VendorAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(
    vendorId: string,
    query: VendorAnalyticsQueryDto,
  ): Promise<VendorAnalyticsSummaryDto> {
    // Preset `range` (e.g. "7d") is used when explicit dates are absent.
    const defaultDaysAgo = query.range ? RANGE_DAYS[query.range] : 30;
    const { start, end } = parseDateRange(
      query.startDate,
      query.endDate,
      defaultDaysAgo,
    );
    const top = query.top ?? 10;

    const notCancelled = { status: { not: OrderStatus.CANCELLED } };

    // All aggregates run DB-side — the previous implementation pulled EVERY
    // order item for the vendor into memory to sum/trend in JavaScript,
    // which degrades linearly (and unboundedly) with sales volume.
    // Independent read queries run in parallel on the connection pool.
    const [
      totalProducts,
      activeProducts,
      lowStockProducts,
      outOfStockProducts,
      totalVariants,
      orderStatusCountsRaw,
      totalRevenueAgg,
      revenueInPeriodAgg,
      revenueTrendRows,
      orderTrendRows,
      distinctOrders,
      variantProducts,
    ] = await Promise.all([
      this.prisma.product.count({
        where: { vendorId, isDeleted: false },
      }),
      this.prisma.product.count({
        where: { vendorId, isDeleted: false, isActive: true },
      }),
      // Low stock products: computed differently for variants since stock is now per-option
      this.prisma.product.count({
        where: {
          vendorId,
          isDeleted: false,
          OR: [{ hasVariants: false, stock: { gt: 0, lte: 5 } }],
        },
      }),
      this.prisma.product.count({
        where: {
          vendorId,
          isDeleted: false,
          OR: [{ hasVariants: false, stock: 0 }],
        },
      }),
      this.prisma.productVariant.count({
        where: { product: { vendorId, isDeleted: false } },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        orderBy: { status: 'asc' },
        where: { orderItems: { some: { vendorId } } },
        _count: { status: true },
      }),
      // Lifetime revenue
      this.prisma.orderItem.aggregate({
        where: { vendorId, order: notCancelled },
        _sum: { totalPrice: true },
      }),
      // Revenue within the requested period
      this.prisma.orderItem.aggregate({
        where: {
          vendorId,
          order: { ...notCancelled, createdAt: { gte: start, lte: end } },
        },
        _sum: { totalPrice: true },
      }),
      // Daily revenue trend — DATE_TRUNC buckets computed in the database
      this.prisma.$queryRaw<{ date: string; value: string | number }[]>`
        SELECT to_char(DATE_TRUNC('day', o."createdAt"), 'YYYY-MM-DD') AS date,
               SUM(oi."totalPrice") AS value
        FROM "order_items" oi
        JOIN "orders" o ON o.id = oi."orderId"
        WHERE oi."vendorId" = ${vendorId}
          AND o.status != 'CANCELLED'
          AND o."createdAt" BETWEEN ${start} AND ${end}
        GROUP BY 1
        ORDER BY 1
      `,
      // Daily order-count trend — distinct orders per day bucket
      this.prisma.$queryRaw<{ date: string; value: string | number }[]>`
        SELECT to_char(DATE_TRUNC('day', o."createdAt"), 'YYYY-MM-DD') AS date,
               COUNT(DISTINCT o.id) AS value
        FROM "order_items" oi
        JOIN "orders" o ON o.id = oi."orderId"
        WHERE oi."vendorId" = ${vendorId}
          AND o.status != 'CANCELLED'
          AND o."createdAt" BETWEEN ${start} AND ${end}
        GROUP BY 1
        ORDER BY 1
      `,
      // Distinct non-cancelled orders (for AOV)
      this.prisma.order.count({
        where: { orderItems: { some: { vendorId } }, ...notCancelled },
      }),
      this.prisma.product.findMany({
        where: { vendorId, isDeleted: false, hasVariants: true },
        select: {
          id: true,
          variants: {
            where: { isDeleted: false, isActive: true },
            select: { stock: true },
          },
        },
      }),
    ]);

    const totalRevenue = Number(totalRevenueAgg._sum.totalPrice ?? 0);

    const [topProducts, customers, productsSoldAgg, recentOrders] =
      await Promise.all([
        this.getTopProducts(vendorId, top),
        this.getCustomerSummary(vendorId, totalRevenue, distinctOrders),
        this.prisma.orderItem.aggregate({
          where: { vendorId, order: notCancelled },
          _sum: { quantity: true },
        }),
        this.prisma.order.findMany({
          where: { orderItems: { some: { vendorId } }, ...notCancelled },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            _count: { select: { orderItems: true } },
          },
        }),
      ]);

    let variantLowStockCount = 0;
    let variantOutOfStockCount = 0;
    const threshold = 5; // same as the product-level threshold

    for (const product of variantProducts) {
      const hasLowStock = product.variants.some(
        (v) => v.stock > 0 && v.stock <= threshold,
      );
      if (hasLowStock) variantLowStockCount++;

      const hasOutOfStock = !product.variants.some((v) => v.stock > 0);
      if (hasOutOfStock) variantOutOfStockCount++;
    }

    const adjustedLowStockProducts = lowStockProducts + variantLowStockCount;
    const adjustedOutOfStockProducts =
      outOfStockProducts + variantOutOfStockCount;

    // ── Derive total orders from status breakdown ──
    const totalOrders = orderStatusCountsRaw.reduce(
      (s, r) =>
        s +
        (typeof r._count === 'object' && r._count !== null
          ? ((r._count as Record<string, number>).status ?? 0)
          : 0),
      0,
    );

    // ── Revenue calculations (DB-side aggregates) ──
    const revenueInPeriod = Number(revenueInPeriodAgg._sum.totalPrice ?? 0);

    // ── Trends (day buckets come pre-aggregated from the database — the
    // previous in-memory grouping overwrote same-day keys, under-counting) ──
    const revenueTrend = this.fillDateGaps(
      revenueTrendRows.map((r) => ({ date: r.date, value: Number(r.value) })),
      start,
      end,
    );

    const newOrdersInPeriod = orderTrendRows.reduce(
      (s, r) => s + Number(r.value),
      0,
    );
    const orderTrend = this.fillDateGaps(
      orderTrendRows.map((r) => ({ date: r.date, value: Number(r.value) })),
      start,
      end,
    );

    // ── Order status breakdown ──
    const orderStatusCounts = orderStatusCountsRaw.map((entry) => ({
      status: entry.status,
      count:
        typeof entry._count === 'object' && entry._count !== null
          ? ((entry._count as Record<string, number>).status ?? 0)
          : 0,
    }));

    // ── Products sold (total units across all order items) ──
    const productsSold = productsSoldAgg._sum.quantity ?? 0;

    // ── Conversion rate ──
    const conversionRate =
      totalProducts > 0
        ? Math.min(
            100,
            Number(
              ((distinctOrders / Math.max(totalProducts, 1)) * 100).toFixed(1),
            ),
          )
        : 0;

    return {
      totalProducts,
      activeProducts,
      lowStockProducts: adjustedLowStockProducts,
      outOfStockProducts: adjustedOutOfStockProducts,
      totalVariants,
      totalOrders,
      newOrdersInPeriod,
      totalRevenue: totalRevenue.toFixed(2),
      revenueInPeriod: revenueInPeriod.toFixed(2),
      orderStatusCounts,
      revenueTrend,
      orderTrend,
      topProducts,
      customers,
      // Frontend-expected aliases
      revenue: totalRevenue.toFixed(2),
      orderCount: totalOrders,
      productsSold,
      avgOrderValue: customers.averageOrderValue,
      recentOrders: recentOrders.map(
        (o: {
          id: string;
          orderNumber: string;
          status: string;
          totalAmount: { toNumber(): number } | number;
          createdAt: Date;
          _count: { orderItems: number };
        }) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          totalAmount:
            typeof o.totalAmount === 'object' &&
            o.totalAmount !== null &&
            'toNumber' in o.totalAmount
              ? o.totalAmount.toNumber()
              : Number(o.totalAmount),
          createdAt: o.createdAt,
          itemCount: o._count.orderItems,
        }),
      ),
      conversionRate,
    };
  }

  private async getTopProducts(vendorId: string, limit: number) {
    const rows = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        vendorId,
        order: { status: { not: OrderStatus.CANCELLED } },
      },
      _sum: { totalPrice: true, quantity: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: limit,
    });

    if (!rows.length) return [];

    const productIds = rows.map((r) => r.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        isActive: true,
        hasVariants: true,
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    return rows.map((r) => {
      const p = productMap.get(r.productId);
      return {
        id: r.productId,
        name: p?.name ?? 'Deleted',
        sku: p?.sku ?? '',
        totalSold: r._sum.quantity ?? 0,
        revenue: Number(r._sum.totalPrice ?? 0).toFixed(2),
        stock: p?.stock ?? 0,
        isActive: p?.isActive ?? false,
      };
    });
  }

  private async getCustomerSummary(
    vendorId: string,
    totalRevenue: number,
    distinctOrders: number,
  ) {
    const [buyers, repeaters] = await Promise.all([
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT o."userId") as count FROM "order_items" oi
        JOIN "orders" o ON o.id = oi."orderId"
        WHERE oi."vendorId" = ${vendorId} AND o.status != 'CANCELLED'
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM (
          SELECT o."userId" FROM "order_items" oi
          JOIN "orders" o ON o.id = oi."orderId"
          WHERE oi."vendorId" = ${vendorId} AND o.status != 'CANCELLED'
          GROUP BY o."userId" HAVING COUNT(DISTINCT o.id) > 1
        ) AS repeaters
      `,
    ]);

    // AOV = lifetime revenue / distinct non-cancelled orders
    const aov = distinctOrders > 0 ? totalRevenue / distinctOrders : 0;

    return {
      totalBuyers: Number(buyers[0]?.count ?? 0),
      repeatBuyers: Number(repeaters[0]?.count ?? 0),
      averageOrderValue: aov.toFixed(2),
    };
  }

  private fillDateGaps(
    data: VendorDailyTrendDto[],
    start: Date,
    end: Date,
  ): VendorDailyTrendDto[] {
    const map = new Map(data.map((d) => [d.date, d.value]));
    const result: VendorDailyTrendDto[] = [];
    const current = new Date(start);
    while (current <= end) {
      const key = current.toISOString().slice(0, 10);
      result.push({ date: key, value: map.get(key) ?? 0 });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }
}
