import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';

import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PerformanceInterceptor } from './modules/shared/interceptors/performance.interceptor';
import { StripRoleResponseInterceptor } from './modules/shared/interceptors/strip-role-response.interceptor';

import { JwtAuthGuard } from './modules/shared/guards/jwt-auth.guard';
import { OtpGuard } from './modules/shared/guards/otp.guard';
import { RolesGuard } from './modules/shared/guards/roles.guard';

import { RedisThrottlerStorage } from './modules/shared/rate-limit/redis-throttler.storage';

import { CacheModule } from './modules/infrastructure/cache/cache.module';
import { PrismaModule } from './modules/infrastructure/prisma/prisma.module';
import { RedisModule } from './modules/infrastructure/redis/redis.module';

import { BillingModule } from './modules/billing/billing.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';

import { AdminAnalyticsModule } from './modules/analytics/admin/admin-analytics.module';
import { AdminCacheModule } from './modules/identity/admin/manage-cache/admin-cache.module';
import { SearchModule } from './modules/search/search.module';
import { AuditLogModule } from './modules/shared/audit-log/audit-log.module';
import { CloudinaryModule } from './modules/shared/services/cloudinary.module';
import { UploadModule } from './modules/shared/upload/upload.module';

// ── Priority 2 Infrastructure Modules ────────────────────
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { CronModule } from './modules/cron/cron.module';
import { MailModule } from './modules/infrastructure/mail/mail.module';
import { OutboxModule } from './modules/infrastructure/outbox/outbox.module';
import { RabbitMQModule } from './modules/infrastructure/rabbitmq/rabbitmq.module';
import { ResiliencyModule } from './modules/infrastructure/resiliency/resiliency.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SecurityModule } from './modules/security/security.module';
import { TrackingModule } from './modules/tracking/tracking.module';

import { validateEnv } from './modules/infrastructure/configuration/env.validation';
import { pinoLoggerConfig } from './modules/infrastructure/configuration/logger.config';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV}.local`,
        process.env.NODE_ENV !== 'test' ? '.env.local' : null,
        `.env.${process.env.NODE_ENV}`,
        '.env',
        `apps/api/.env.${process.env.NODE_ENV}.local`,
        `apps/api/.env.${process.env.NODE_ENV}`,
        'apps/api/.env',
      ].filter(Boolean) as string[],
      validate: validateEnv,
    }),
    LoggerModule.forRoot(pinoLoggerConfig()),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    // Global rate limits, backed by Redis (shared across instances).
    // Named throttlers let individual controllers tighten their own limits
    // via @Throttle() while inheriting the Redis storage.
    ThrottlerModule.forRootAsync({
      inject: ['REDIS_CLIENT'],
      useFactory: (redis: import('ioredis').default) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: 100, // 100 req/min baseline; tightened per-route via @StrictThrottle, etc.
          },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),

    // ── Database & Core ────────────────────────────────
    PrismaModule,
    RedisModule,
    CacheModule,
    HealthModule,

    // ── Domain Bounded Contexts ────────────────────────
    IdentityModule,
    CatalogModule,
    CheckoutModule,
    BillingModule,
    EngagementModule,

    // ── Cross-Cutting & Operational Modules ────────────
    AdminAnalyticsModule,
    AdminCacheModule,
    SearchModule,
    AuditLogModule,
    UploadModule,
    CloudinaryModule,

    // ── Priority 2 New Infrastructure ──────────────────
    RabbitMQModule,
    OutboxModule,
    ResiliencyModule,
    NotificationsModule,
    MailModule,
    TrackingModule,
    AnalyticsModule,
    CronModule,
    SecurityModule,
  ],

  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OtpGuard },
    { provide: APP_INTERCEPTOR, useClass: PerformanceInterceptor },
    { provide: APP_INTERCEPTOR, useClass: StripRoleResponseInterceptor },
  ],
})
export class AppModule {}
