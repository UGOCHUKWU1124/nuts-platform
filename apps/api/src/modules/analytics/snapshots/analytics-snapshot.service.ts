import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@api/modules/infrastructure/prisma/prisma.service';

@Injectable()
export class AnalyticsSnapshotService {
  private readonly logger = new Logger(AnalyticsSnapshotService.name);
  private readonly defaultCurrency: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.defaultCurrency =
      this.configService.get<string>('DEFAULT_CURRENCY') || 'ngn';
  }

  /**
   * Generate a dashboard analytics snapshot.
   */
  async generateSnapshot(): Promise<{
    totalUsers: number;
    totalVendors: number;
    totalProducts: number;
    totalOrders: number;
    totalRevenue: number;
    totalRevenueFormatted: string;
    currency: string;
    snapshotDate: string;
  }> {
    const [totalUsers, totalVendors, totalProducts, orderAgg] =
      await Promise.all([
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.vendor.count({
          where: { isActive: true, isApproved: true },
        }),
        this.prisma.product.count({
          where: { isActive: true, isDeleted: false },
        }),
        this.prisma.order.aggregate({
          _sum: { finalAmount: true },
          _count: true,
          where: { status: { not: 'CANCELLED' } },
        }),
      ]);

    const totalRevenue = Number(orderAgg._sum.finalAmount) || 0;

    return {
      totalUsers,
      totalVendors,
      totalProducts,
      totalOrders: orderAgg._count,
      totalRevenue,
      totalRevenueFormatted: `${this.defaultCurrency.toUpperCase()} ${totalRevenue.toFixed(2)}`,
      currency: this.defaultCurrency,
      snapshotDate: new Date().toISOString(),
    };
  }
}
