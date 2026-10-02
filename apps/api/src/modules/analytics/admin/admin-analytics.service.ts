import { Injectable } from '@nestjs/common';
import { CacheService } from 'src/modules/infrastructure/cache/cache.service';
import { PrismaService } from 'src/modules/infrastructure/prisma/prisma.service';
import { parseDateRange } from 'src/modules/shared/utils/date-range.util';
import { RANGE_DAYS } from '../vendors/dto/vendor-analytics-query.dto';
import { AdminAnalyticsAuditService } from './admin-analytics-audit.service';
import { AdminAnalyticsProductsService } from './admin-analytics-products.service';
import { AdminAnalyticsPromotionsService } from './admin-analytics-promotions.service';
import { AdminAnalyticsRevenueService } from './admin-analytics-revenue.service';
import { AdminAnalyticsUsersService } from './admin-analytics-users.service';
import { AdminAnalyticsQueryDto } from './dto/admin-analytics-query.dto';
import { AdminAnalyticsSummaryDto } from './dto/admin-analytics-summary.dto';

const ANALYTICS_CACHE_PREFIX = 'admin:analytics:summary:';
const ANALYTICS_CACHE_TTL = 900; // 15 minutes (increased from 5 minutes for better performance)

@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly revenue: AdminAnalyticsRevenueService,
    private readonly products: AdminAnalyticsProductsService,
    private readonly users: AdminAnalyticsUsersService,
    private readonly promotions: AdminAnalyticsPromotionsService,
    private readonly audit: AdminAnalyticsAuditService,
  ) {}

  async getSummary(
    query: AdminAnalyticsQueryDto,
  ): Promise<AdminAnalyticsSummaryDto> {
    const { start, end } = parseDateRange(
      query.startDate,
      query.endDate,
      query.range ? RANGE_DAYS[query.range] : 30,
    );
    const cacheKey = `${ANALYTICS_CACHE_PREFIX}${start.toISOString()}:${end.toISOString()}`;

    return this.cacheService.wrap(cacheKey, ANALYTICS_CACHE_TTL, async () => {
      // Run independent queries in parallel
      const [
        totalUsers,
        activeUsers,
        totalOrders,
        totalRevenue,
        revenueInPeriod,
        orderStatusCounts,
        revenueTrend,
        orderTrend,
        totalProducts,
        totalVariants,
        totalDiscountCodes,
        totalShippingAddresses,
        totalVendors,
        activeVendors,
        verifiedVendors,
        approvedVendors,
        totalVendorOrderItems,
        newVendors,
        newUsers,
        newOrders,
      ] = await Promise.all([
        this.users.getTotalUsers(),
        this.users.getActiveUsers(),
        this.revenue.getTotalOrders(),
        this.revenue.getTotalRevenue(),
        this.revenue.getRevenueInPeriod(start, end),
        this.revenue.getOrderStatusCounts(),
        this.revenue.getRevenueTrend(start, end),
        this.revenue.getOrderTrend(start, end),
        this.products.getTotalProducts(),
        this.products.getTotalVariants(),
        this.promotions.getDiscountAnalytics().then((d) => d.totalCodes),
        this.prisma.shippingAddress.count(),
        this.products.getTotalVendors(),
        this.products.getActiveVendors(),
        this.products.getVerifiedVendors(),
        this.products.getApprovedVendors(),
        this.products.getTotalVendorOrderItems(),
        this.products.getNewVendorsInPeriod(start, end),
        this.users.getNewUsersInPeriod(start, end),
        this.revenue.getNewOrdersInPeriod(start, end),
      ]);

      return {
        totalUsers,
        activeUsers,
        totalOrders,
        totalRevenue: totalRevenue.toFixed(2),
        revenueInPeriod: revenueInPeriod.toFixed(2),
        totalProducts,
        totalVariants,
        totalDiscountCodes,
        totalShippingAddresses,
        totalVendors,
        activeVendors,
        verifiedVendors,
        approvedVendors,
        totalVendorOrderItems,
        newVendorsInPeriod: newVendors,
        newUsersInPeriod: newUsers,
        newOrdersInPeriod: newOrders,
        orderStatusCounts,
        revenueTrend,
        orderTrend,
      };
    });
  }

  async getTopProducts(
    query: AdminAnalyticsQueryDto,
  ): Promise<AdminAnalyticsSummaryDto['topProducts']> {
    const top = query.top ?? 10;
    return this.products.getTopProducts(top);
  }

  async getTopVendors(
    query: AdminAnalyticsQueryDto,
  ): Promise<AdminAnalyticsSummaryDto['topVendors']> {
    const top = query.top ?? 10;
    return this.products.getTopVendors(top);
  }

  async getTopCategories(
    query: AdminAnalyticsQueryDto,
  ): Promise<AdminAnalyticsSummaryDto['topCategories']> {
    const top = query.top ?? 10;
    return this.products.getTopCategories(top);
  }

  async getPaymentAnalytics(): Promise<AdminAnalyticsSummaryDto['payments']> {
    return this.promotions.getPaymentAnalytics();
  }

  async getDiscountAnalytics(): Promise<AdminAnalyticsSummaryDto['discounts']> {
    return this.promotions.getDiscountAnalytics();
  }

  async getReferralAnalytics(): Promise<AdminAnalyticsSummaryDto['referrals']> {
    return this.promotions.getReferralAnalytics();
  }

  async getUserAnalytics(
    query: AdminAnalyticsQueryDto,
  ): Promise<AdminAnalyticsSummaryDto['users']> {
    const { start, end } = parseDateRange(
      query.startDate,
      query.endDate,
      query.range ? RANGE_DAYS[query.range] : 30,
    );
    const cacheKey = `${ANALYTICS_CACHE_PREFIX}users:${start.toISOString()}:${end.toISOString()}`;

    return this.cacheService.wrap(cacheKey, ANALYTICS_CACHE_TTL, async () => {
      const [
        totalUsers,
        activeUsers,
        deactivatedUsers,
        newUsersInPeriod,
        usersWithOrders,
        repeatCustomers,
        aov,
        registrationTrend,
      ] = await Promise.all([
        this.users.getTotalUsers(),
        this.users.getActiveUsers(),
        this.users.getDeactivatedUsers(),
        this.users.getNewUsersInPeriod(start, end),
        this.users.getUsersWithOrders(),
        this.users.getRepeatCustomers(),
        this.revenue.getAverageOrderValue(start, end),
        this.users.getRegistrationTrend(start, end),
      ]);

      return {
        totalUsers,
        activeUsers,
        deactivatedUsers,
        newUsersInPeriod,
        usersWithOrders,
        repeatCustomers,
        averageOrderValue: aov.toFixed(2),
        registrationTrend,
      };
    });
  }

  async getFunnelAnalytics(
    query: AdminAnalyticsQueryDto,
  ): Promise<AdminAnalyticsSummaryDto['funnel']> {
    const { start, end } = parseDateRange(
      query.startDate,
      query.endDate,
      query.range ? RANGE_DAYS[query.range] : 30,
    );
    const cacheKey = `${ANALYTICS_CACHE_PREFIX}funnel:${start.toISOString()}:${end.toISOString()}`;
    return this.cacheService.wrap(cacheKey, ANALYTICS_CACHE_TTL, async () => {
      return this.users.getFunnel(start, end);
    });
  }

  async getActivityAnalytics(
    query: AdminAnalyticsQueryDto,
  ): Promise<AdminAnalyticsSummaryDto['activity']> {
    const { start, end } = parseDateRange(
      query.startDate,
      query.endDate,
      query.range ? RANGE_DAYS[query.range] : 30,
    );
    const cacheKey = `${ANALYTICS_CACHE_PREFIX}activity:${start.toISOString()}:${end.toISOString()}`;
    return this.cacheService.wrap(cacheKey, ANALYTICS_CACHE_TTL, async () => {
      return this.audit.getActivityAnalytics(start, end);
    });
  }
}
