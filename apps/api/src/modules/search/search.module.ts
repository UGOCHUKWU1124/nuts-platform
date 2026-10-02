import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/modules/infrastructure/prisma/prisma.module';
import { SearchModule as CommonSearchModule } from 'src/modules/shared/search/search.module';
import { AdminSearchController } from './admin-search.controller';
import { SearchController } from './search.controller';
import { VendorSearchController } from './vendor-search.controller';

@Module({
  imports: [CommonSearchModule, PrismaModule],
  controllers: [
    SearchController,
    AdminSearchController,
    VendorSearchController,
  ],
})
export class SearchModule {}
