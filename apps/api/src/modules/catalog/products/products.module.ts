import { Module } from '@nestjs/common';
import { SearchModule } from '@api/modules/shared/search/search.module';
import { CategoriesModule } from '../categories/categories.module';
import { ProductController } from './product.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [CategoriesModule, SearchModule],
  controllers: [ProductController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
