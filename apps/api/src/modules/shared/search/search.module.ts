import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@api/modules/infrastructure/redis/redis.module';
import { SearchService } from './search.service';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
