// vendor-analytics.service.ts

import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/modules/infrastructure/prisma/prisma.service';
import { parseDateRange } from 'src/modules/shared/utils/date-range.util';
import { VendorAnalyticsQueryDto } from './dto/vendor-analytics-query.dto';
import {
  VendorAnalyticsSummaryDto,
  VendorDailyTrendDto,
} from './dto/vendor-analytics-summary.dto';

const LOW_STOCK_THRESHOLD = 5;

type DailyAggregateRow = {
  date: string;
  value: string | number | Prisma.Decimal;
};

type RevenueAggregateRow = {
  totalRevenue: string | number | Prisma.Decimal | null;
  totalOrders: bigint | number | null;
};

@Injectable()
export class VendorAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(
    vendorId: string,
    query: VendorAnalyticsQueryDto,
  ): Promise<VendorAnalyticsSummaryDto> {
    const { start, end } = parseDateRange(query.startDate, query.endDate, 30);

    const top = query.top ?? 10;

    /*
     * Keep independent database reads parallel.
     *
     * More importantly, aggregation is performed by PostgreSQL instead of
     * loading every historical order item into Node.js memory.
     *
     * The old implementation fetched the vendor's entire order history,
     * then calculated revenue/trends/AOV in JavaScript. That becomes
     * increasingly expensive as the store grows.
     */
    const [
      totalProducts,
      activeProducts,
      lowStockProducts,
      outOfStockProducts,
      totalVariants,
      orderStatusCountsRaw,
      revenueAggregate,
      periodRevenueAggregate,
      revenueTrendRows,
      orderTrendRows,
      topProducts,
      customers,
    ] = await Promise.all([
      this.prisma.product.count({
        where: {
          vendorId,
          isDeleted: false,
        },
      }),

      this.prisma.product.count({
        where: {
          vendorId,
          isDeleted: false,
          isActive: true,
        },
      }),

      /*
       * A product is low-stock when:
       * - it has no variants and its own stock is 1..5, OR
       * - it has variants and at least one active variant is 1..5.
       *
       * We calculate this entirely in SQL through Prisma's relation filters,
       * avoiding loading all variants into application memory.
       */
      this.prisma.product.count({
        where: {
          vendorId,
          isDeleted: false,
          OR: [
            {
              hasVariants: false,
              stock: {
                gt: 0,
                lte: LOW_STOCK_THRESHOLD,
              },
            },
            {
              hasVariants: true,
              variants: {
                some: {
                  isDeleted: false,
                  isActive: true,
                  stock: {
                    gt: 0,
                    lte: LOW_STOCK_THRESHOLD,
                  },
                },
              },
            },
          ],
        },
      }),

      /*
       * A variant-based product is considered out of stock only when none
       * of its active/non-deleted variants has stock available.
       */
      this.prisma.product.count({
        where: {
          vendorId,
          isDeleted: false,
          OR: [
            {
              hasVariants: false,
              stock: 0,
            },
            {
              hasVariants: true,
              variants: {
                none: {
                  isDeleted: false,
                  isActive: true,
                  stock: {
                    gt: 0,
                  },
                },
              },
            },
          ],
        },
      }),

      this.prisma.productVariant.count({
        where: {
          product: {
            vendorId,
            isDeleted: false,
          },
        },
      }),

      /*
       * An order is counted once even if it contains multiple products from
       * the same vendor because the aggregation is performed on orders.
       */
      this.prisma.order.groupBy({
        by: ['status'],
        where: {
          orderItems: {
            some: {
              vendorId,
            },
          },
        },
        _count: {
          _all: true,
        },
        orderBy: {
          status: 'asc',
        },
      }),

      /*
       * Lifetime vendor revenue and order count.
       *
       * PostgreSQL performs the SUM/COUNT rather than transferring the
       * complete order-item history to the Node.js process.
       */
      this.prisma.$queryRaw<RevenueAggregateRow[]>`
        SELECT
          COALESCE(SUM(oi."totalPrice"), 0)::text AS "totalRevenue",
          COUNT(DISTINCT o.id)::bigint AS "totalOrders"
        FROM "order_items" oi
        INNER JOIN "orders" o
          ON o.id = oi."orderId"
        WHERE oi."vendorId" = ${vendorId}
          AND o.status <> ${OrderStatus.CANCELLED};
      `,

      /*
       * Revenue for the requested period.
       */
      this.prisma.$queryRaw<RevenueAggregateRow[]>`
        SELECT
          COALESCE(SUM(oi."totalPrice"), 0)::text AS "totalRevenue",
          COUNT(DISTINCT o.id)::bigint AS "totalOrders"
        FROM "order_items" oi
        INNER JOIN "orders" o
          ON o.id = oi."orderId"
        WHERE oi."vendorId" = ${vendorId}
          AND o.status <> ${OrderStatus.CANCELLED}
          AND o."createdAt" >= ${start}
          AND o."createdAt" <= ${end};
      `,

      /*
       * PostgreSQL groups by calendar day.
       *
       * This fixes the old groupBy({ by: ['createdAt'] }) implementation,
       * which grouped every unique timestamp separately instead of grouping
       * all orders/items from the same day together.
       */
      this.prisma.$queryRaw<DailyAggregateRow[]>`
        SELECT
          TO_CHAR(DATE_TRUNC('day', o."createdAt"), 'YYYY-MM-DD') AS date,
          COALESCE(SUM(oi."totalPrice"), 0)::text AS value
        FROM "order_items" oi
        INNER JOIN "orders" o
          ON o.id = oi."orderId"
        WHERE oi."vendorId" = ${vendorId}
          AND o.status <> ${OrderStatus.CANCELLED}
          AND o."createdAt" >= ${start}
          AND o."createdAt" <= ${end}
        GROUP BY DATE_TRUNC('day', o."createdAt")
        ORDER BY DATE_TRUNC('day', o."createdAt") ASC;
      `,

      /*
       * COUNT(DISTINCT o.id) is important here.
       *
       * One order can contain multiple order_items belonging to the vendor,
       * but the dashboard should count that as one order, not several orders.
       */
      this.prisma.$queryRaw<DailyAggregateRow[]>`
        SELECT
          TO_CHAR(DATE_TRUNC('day', o."createdAt"), 'YYYY-MM-DD') AS date,
          COUNT(DISTINCT o.id)::text AS value
        FROM "order_items" oi
        INNER JOIN "orders" o
          ON o.id = oi."orderId"
        WHERE oi."vendorId" = ${vendorId}
          AND o."createdAt" >= ${start}
          AND o."createdAt" <= ${end}
        GROUP BY DATE_TRUNC('day', o."createdAt")
        ORDER BY DATE_TRUNC('day', o."createdAt") ASC;
      `,

      this.getTopProducts(vendorId, top),

      this.getCustomerSummary(vendorId),
    ]);

    const totalRevenue = Number(revenueAggregate[0]?.totalRevenue ?? 0);

    const revenueInPeriod = Number(
      periodRevenueAggregate[0]?.totalRevenue ?? 0,
    );

    const totalOrders = Number(revenueAggregate[0]?.totalOrders ?? 0);

    const newOrdersInPeriod = Number(
      periodRevenueAggregate[0]?.totalOrders ?? 0,
    );

    const revenueTrend = this.fillDateGaps(
      revenueTrendRows.map((row) => ({
        date: row.date,
        value: Number(row.value),
      })),
      start,
      end,
    );

    const orderTrend = this.fillDateGaps(
      orderTrendRows.map((row) => ({
        date: row.date,
        value: Number(row.value),
      })),
      start,
      end,
    );

    const orderStatusCounts = orderStatusCountsRaw.map((entry) => ({
      status: entry.status,
      count: entry._count._all,
    }));

    return {
      totalProducts,
      activeProducts,
      lowStockProducts,
      outOfStockProducts,
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
    };
  }

  private async getTopProducts(vendorId: string, limit: number) {
    const rows = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        vendorId,
        order: {
          status: {
            not: OrderStatus.CANCELLED,
          },
        },
      },
      _sum: {
        totalPrice: true,
        quantity: true,
      },
      orderBy: {
        _sum: {
          totalPrice: 'desc',
        },
      },
      take: limit,
    });

    if (rows.length === 0) {
      return [];
    }

    const productIds = rows.map((row) => row.productId);

    /*
     * This is intentionally a second query instead of querying each product
     * individually. It prevents an N+1 query problem.
     */
    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: productIds,
        },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        isActive: true,
        hasVariants: true,
      },
    });

    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );

    return rows.map((row) => {
      const product = productMap.get(row.productId);

      return {
        id: row.productId,
        name: product?.name ?? 'Deleted',
        sku: product?.sku ?? '',
        totalSold: row._sum.quantity ?? 0,
        revenue: Number(row._sum.totalPrice ?? 0).toFixed(2),
        stock: product?.stock ?? 0,
        isActive: product?.isActive ?? false,
      };
    });
  }

  private async getCustomerSummary(vendorId: string) {
    /*
     * Both customer metrics are calculated in PostgreSQL.
     *
     * The previous implementation fetched all vendor order items merely
     * to calculate AOV. This makes analytics memory usage grow with the
     * vendor's entire sales history.
     */
    const [customerStats] = await this.prisma.$queryRaw<
      {
        totalBuyers: bigint;
        repeatBuyers: bigint;
        totalRevenue: string;
        totalOrders: bigint;
      }[]
    >`
      WITH customer_orders AS (
        SELECT
          o."userId",
          COUNT(DISTINCT o.id)::bigint AS order_count
        FROM "order_items" oi
        INNER JOIN "orders" o
          ON o.id = oi."orderId"
        WHERE oi."vendorId" = ${vendorId}
          AND o.status <> ${OrderStatus.CANCELLED}
        GROUP BY o."userId"
      ),
      vendor_totals AS (
        SELECT
          COALESCE(SUM(oi."totalPrice"), 0)::text AS total_revenue,
          COUNT(DISTINCT o.id)::bigint AS total_orders
        FROM "order_items" oi
        INNER JOIN "orders" o
          ON o.id = oi."orderId"
        WHERE oi."vendorId" = ${vendorId}
          AND o.status <> ${OrderStatus.CANCELLED}
      )
      SELECT
        (SELECT COUNT(*)::bigint FROM customer_orders) AS "totalBuyers",
        (
          SELECT COUNT(*)::bigint
          FROM customer_orders
          WHERE order_count > 1
        ) AS "repeatBuyers",
        (SELECT total_revenue FROM vendor_totals) AS "totalRevenue",
        (SELECT total_orders FROM vendor_totals) AS "totalOrders";
    `;

    const totalRevenue = Number(customerStats?.totalRevenue ?? 0);
    const totalOrders = Number(customerStats?.totalOrders ?? 0);

    /*
     * AOV is revenue divided by orders, not revenue divided by order items.
     *
     * An order containing three vendor products is still one customer order.
     */
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      totalBuyers: Number(customerStats?.totalBuyers ?? 0),
      repeatBuyers: Number(customerStats?.repeatBuyers ?? 0),
      averageOrderValue: averageOrderValue.toFixed(2),
    };
  }

  private fillDateGaps(
    data: VendorDailyTrendDto[],
    start: Date,
    end: Date,
  ): VendorDailyTrendDto[] {
    const valueByDate = new Map(data.map((item) => [item.date, item.value]));

    const result: VendorDailyTrendDto[] = [];

    /*
     * Work with date-only UTC values so DST/local timezone changes cannot
     * accidentally skip or duplicate dashboard dates.
     */
    const current = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );

    const lastDay = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
    );

    while (current <= lastDay) {
      const key = current.toISOString().slice(0, 10);

      result.push({
        date: key,
        value: valueByDate.get(key) ?? 0,
      });

      current.setUTCDate(current.getUTCDate() + 1);
    }

    return result;
  }
}
