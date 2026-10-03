import { Module } from '@nestjs/common';
import { AdminCategoryModule } from '../identity/admin/manage-category/admin-category.module';
import { AdminProductVariantsModule } from '../identity/admin/manage-product-variants/admin-product-variant.module';
import { AdminProductModule } from '../identity/admin/manage-products/admin-product.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { ProductVariantsModule } from './variants/product-variants.module';

/**
 * Catalog Bounded Context Module
 *
 * Encapsulates products, taxonomy categories, variant configurations,
 * and merchant/admin catalog lifecycle operations.
 */
@Module({
  imports: [
    ProductsModule,
    CategoriesModule,
    ProductVariantsModule,
    AdminProductModule,
    AdminProductVariantsModule,
    AdminCategoryModule,
  ],
  exports: [
    ProductsModule,
    CategoriesModule,
    ProductVariantsModule,
    AdminProductModule,
    AdminProductVariantsModule,
    AdminCategoryModule,
  ],
})
export class CatalogModule {}
