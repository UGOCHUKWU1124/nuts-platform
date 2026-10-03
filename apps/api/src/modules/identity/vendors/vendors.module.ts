import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { VendorAnalyticsController } from '@api/modules/analytics/vendors/vendor-analytics.controller';
import { VendorAnalyticsService } from '@api/modules/analytics/vendors/vendor-analytics.service';
import { AuthCookiesModule } from '@api/modules/auth/auth-cookies.module';
import { AuthModule } from '@api/modules/auth/auth.module';
import { OtpService } from '@api/modules/auth/otp/otp.service';
import { PrismaModule } from '@api/modules/infrastructure/prisma/prisma.module';
import { OrdersModule } from '@api/modules/orders/orders.module';
import { ProductVariantsModule } from '@api/modules/product-variants/product-variants.module';
import { ProductsModule } from '@api/modules/products/products.module';
import { DiscountCodeModule } from '@api/modules/promotions/discount-code.module';
import { SecurityModule } from '@api/modules/security/security.module';
import { WalletModule } from '@api/modules/wallet/wallet.module';
import { VendorWalletController } from './manage-wallet/vendor-wallet.controller';
import { PublicStoreController } from './public-store.controller';
import { VendorJwtStrategy } from './strategies/vendor-jwt.strategy';
import { VendorRefreshTokenStrategy } from './strategies/vendor-refresh-token.strategy';
import { VendorAccountController } from './vendor-account.controller';
import { VendorAuthController } from './vendor-auth.controller';
import { VendorDiscountCodesController } from './vendor-discount-codes.controller';
import { VendorOrdersController } from './vendor-orders.controller';
import { VendorProductVariantsController } from './vendor-product-variants.controller';
import { VendorProductsController } from './vendor-products.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [
    AuthCookiesModule,
    AuthModule,
    DiscountCodeModule,
    JwtModule,
    OrdersModule,
    PrismaModule,
    ProductVariantsModule,
    ProductsModule,
    SecurityModule,
    WalletModule,
  ],
  controllers: [
    VendorAuthController,
    PublicStoreController,
    VendorAccountController,
    VendorAnalyticsController,
    VendorDiscountCodesController,
    VendorOrdersController,
    VendorProductVariantsController,
    VendorProductsController,
    VendorWalletController,
  ],
  providers: [
    VendorAnalyticsService,
    VendorJwtStrategy,
    VendorRefreshTokenStrategy,
    VendorsService,
    OtpService,
  ],
  exports: [VendorsService],
})
export class VendorsModule {}
