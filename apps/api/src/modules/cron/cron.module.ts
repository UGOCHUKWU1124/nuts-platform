import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from 'src/modules/infrastructure/prisma/prisma.module';
import { RabbitMQModule } from 'src/modules/infrastructure/rabbitmq/rabbitmq.module';
import { RedisModule } from 'src/modules/infrastructure/redis/redis.module';
import { AbandonedCartCron } from './abandoned-cart/abandoned-cart.cron';
import { LowStockCron } from './low-stock/low-stock.cron';
import { VendorSummaryCron } from './vendor-summary/vendor-summary.cron';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    RabbitMQModule,
    PrismaModule,
    RedisModule,
  ],
  providers: [AbandonedCartCron, LowStockCron, VendorSummaryCron],
})
export class CronModule {}
