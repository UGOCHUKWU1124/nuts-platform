import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@api/modules/infrastructure/prisma/prisma.service';
import type {
  CartAbandonmentRateDto,
  DashboardAnalyticsDto,
  ProductViewAnalyticsDto,
  SearchAnalyticsDto,
} from '../dto/analytics.dto';

@Injectable()
export class AnalyticsReportService {
  private readonly logger = new Logger(AnalyticsReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate cart abandonment rate.
   * Abandoned = carts that have items but never checked out or have no associated orders.
   */
  async getCartAbandonmentRate(): Promise<CartAbandonmentRateDto> {
    const totalCarts = await this.prisma.cart.count();
    const abandonedCarts = await this.prisma.cart.count({
      where: {
        checkedOut: false,
        cartItems: { some: {} },
      },
    });

    const rate = totalCarts > 0 ? (abandonedCarts / totalCarts) * 100 : 0;

    return {
      rate: Math.round(rate * 100) / 100,
      abandonedCarts,
      totalCarts,
    };
  }

  /**
   * Get search analytics including zero-result searches.
   */
  async getSearchAnalytics(
    from?: Date,
    to?: Date,
  ): Promise<SearchAnalyticsDto> {
    const where: Record<string, unknown> = {};
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = from;
      if (to) (where.createdAt as Record<string, unknown>).lte = to;
    }

    const [totalSearches, zeroResultSearches, topSearches] = await Promise.all([
      this.prisma.searchQuery.count({ where }),
      this.prisma.searchQuery.count({
        where: { ...where, resultsCount: 0 },
      }),
      this.prisma.searchQuery.groupBy({
        by: ['query'],
        _count: { query: true },
        orderBy: { _count: { query: 'desc' } },
        take: 20,
        where,
      }),
    ]);

    return {
      totalSearches,
      zeroResultSearches,
      zeroResultRate:
        totalSearches > 0
          ? Math.round((zeroResultSearches / totalSearches) * 10000) / 100
          : 0,
      topSearches: topSearches.map((s) => ({
        query: s.query,
        count: s._count.query,
      })),
    };
  }

  /**
   * Get product view analytics.
   */
  async getProductViewAnalytics(
    from?: Date,
    to?: Date,
  ): Promise<ProductViewAnalyticsDto> {
    const where: Record<string, unknown> = {};
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = from;
      if (to) (where.createdAt as Record<string, unknown>).lte = to;
    }

    const [totalViews, uniqueProducts, topViewed] = await Promise.all([
      this.prisma.productView.count({ where }),
      this.countUniqueProductsViewed(from, to),
      this.prisma.productView.groupBy({
        by: ['productId'],
        _count: { productId: true },
        orderBy: { _count: { productId: 'desc' } },
        take: 10,
        where,
      }),
    ]);

    // Resolve product names
    const productIds = topViewed.map((v) => v.productId);
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p.name]));

    return {
      totalViews,
      uniqueProducts,
      topViewed: topViewed.map((v) => ({
        productId: v.productId,
        productName: productMap.get(v.productId) || 'Unknown',
        views: v._count.productId,
      })),
    };
  }

  /**
   * Get full dashboard analytics.
   */
  async getDashboardAnalytics(
    from?: Date,
    to?: Date,
  ): Promise<DashboardAnalyticsDto> {
    const [
      cartAbandonmentRate,
      searchAnalytics,
      productViews,
      orderAgg,
      totalUsers,
    ] = await Promise.all([
      this.getCartAbandonmentRate(),
      this.getSearchAnalytics(from, to),
      this.getProductViewAnalytics(from, to),
      this.prisma.order.aggregate({
        _sum: { finalAmount: true },
        _count: true,
        where: {
          status: { not: 'CANCELLED' },
          ...(from || to
            ? {
                createdAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
      }),
      this.prisma.user.count({ where: { isActive: true } }),
    ]);

    return {
      cartAbandonmentRate,
      searchAnalytics,
      productViews,
      totalRevenue: Number(orderAgg._sum.finalAmount) || 0,
      totalOrders: orderAgg._count,
      totalUsers,
    };
  }

  /**
   * Directly aggregates distinct product views in PostgreSQL instead of loading
   * thousands of individual records into application memory.
   */
  private async countUniqueProductsViewed(
    from?: Date,
    to?: Date,
  ): Promise<number> {
    if (from && to) {
      const [res] = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "productId") AS count
        FROM "product_views"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      `;
      return Number(res?.count ?? 0);
    } else if (from) {
      const [res] = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "productId") AS count
        FROM "product_views" WHERE "createdAt" >= ${from}
      `;
      return Number(res?.count ?? 0);
    } else if (to) {
      const [res] = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "productId") AS count
        FROM "product_views" WHERE "createdAt" <= ${to}
      `;
      return Number(res?.count ?? 0);
    }

    const [res] = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "productId") AS count FROM "product_views"
    `;
    return Number(res?.count ?? 0);
  }
}
