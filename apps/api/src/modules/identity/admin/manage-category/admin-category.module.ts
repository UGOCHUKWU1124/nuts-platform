import { Module } from '@nestjs/common';
import { CategoriesModule } from '@api/modules/category/categories.module';
import { AdminCategoryController } from './admin-category.controller';

@Module({
  imports: [CategoriesModule],
  controllers: [AdminCategoryController],
})
export class AdminCategoryModule {}
