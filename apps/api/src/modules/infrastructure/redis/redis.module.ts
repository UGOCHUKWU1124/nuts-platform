import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedlockService } from './redlock.service';

export * from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const redisUrl = configService.getOrThrow<string>('REDIS_URL');

        return new Redis(redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          lazyConnect: false,
        });
      },
    },
    RedlockService,
  ],
  exports: [REDIS_CLIENT, RedlockService],
})
export class RedisModule {}
