import { Module } from '@nestjs/common';
import { PaymentsModule } from '@api/modules/payments/payments.module';
import { DiscountCodeModule } from '@api/modules/promotions/discount-code.module';
import { ReferralModule } from '@api/modules/referral/referral.module';
import { UsersModule } from '@api/modules/users/users.module';
import { WalletModule } from '@api/modules/wallet/wallet.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    UsersModule,
    DiscountCodeModule,
    ReferralModule,
    PaymentsModule,
    WalletModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
