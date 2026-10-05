import { Global, Module } from '@nestjs/common';

import { RedisModule } from '@api/modules/infrastructure/redis/redis.module';
import { RedlockService } from '@api/modules/infrastructure/redis/redlock.service';
import { CacheService } from './cache.service';

@Global()
@Module({
  imports: [RedisModule],
  // RedlockService is exported by RedisModule (which is @Global), but we
  // explicitly list it here so the CacheService constructor injection is
  // resolved correctly within this module's provider scope.
  providers: [CacheService, RedlockService],
  exports: [CacheService],
})
export class CacheModule {}
