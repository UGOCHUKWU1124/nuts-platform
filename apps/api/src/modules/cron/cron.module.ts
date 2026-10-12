import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '@api/modules/infrastructure/prisma/prisma.module';
import { RabbitMQModule } from '@api/modules/infrastructure/rabbitmq/rabbitmq.module';
import { RedisModule } from '@api/modules/infrastructure/redis/redis.module';
import { AbandonedCartCron } from './abandoned-cart/abandoned-cart.cron';
import { LowStockCron } from './low-stock/low-stock.cron';
import { VendorSummaryCron } from './vendor-summary/vendor-summary.cron';
import { NotificationRetentionCron } from './notification-retention/notification-retention.cron';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    RabbitMQModule,
    PrismaModule,
    RedisModule,
  ],
  providers: [
    AbandonedCartCron,
    LowStockCron,
    VendorSummaryCron,
    NotificationRetentionCron,
  ],
})
export class CronModule {}
