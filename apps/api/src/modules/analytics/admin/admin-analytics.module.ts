import { Module } from '@nestjs/common';
import { CacheModule } from '@api/modules/infrastructure/cache/cache.module';
import { PrismaModule } from '@api/modules/infrastructure/prisma/prisma.module';
import { AdminAnalyticsAuditService } from './admin-analytics-audit.service';
import { AdminAnalyticsProductsService } from './admin-analytics-products.service';
import { AdminAnalyticsPromotionsService } from './admin-analytics-promotions.service';
import { AdminAnalyticsRevenueService } from './admin-analytics-revenue.service';
import { AdminAnalyticsUsersService } from './admin-analytics-users.service';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';

@Module({
  imports: [PrismaModule, CacheModule],
  controllers: [AdminAnalyticsController],
  providers: [
    AdminAnalyticsService,
    AdminAnalyticsRevenueService,
    AdminAnalyticsProductsService,
    AdminAnalyticsUsersService,
    AdminAnalyticsPromotionsService,
    AdminAnalyticsAuditService,
  ],
})
export class AdminAnalyticsModule {}
