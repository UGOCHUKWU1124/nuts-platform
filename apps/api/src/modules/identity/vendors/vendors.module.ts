import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { VendorAnalyticsController } from 'src/modules/analytics/vendors/vendor-analytics.controller';
import { VendorAnalyticsService } from 'src/modules/analytics/vendors/vendor-analytics.service';
import { AuthCookiesModule } from 'src/modules/auth/auth-cookies.module';
import { OtpService } from 'src/modules/auth/otp/otp.service';
import { PrismaModule } from 'src/modules/infrastructure/prisma/prisma.module';
import { OrdersModule } from 'src/modules/orders/orders.module';
import { ProductVariantsModule } from 'src/modules/product-variants/product-variants.module';
import { ProductsModule } from 'src/modules/products/products.module';
import { DiscountCodeModule } from 'src/modules/promotions/discount-code.module';
import { SecurityModule } from 'src/modules/security/security.module';
import { WalletModule } from 'src/modules/wallet/wallet.module';
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
