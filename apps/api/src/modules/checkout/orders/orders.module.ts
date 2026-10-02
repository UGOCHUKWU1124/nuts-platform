import { Module } from '@nestjs/common';
import { PaymentsModule } from 'src/modules/payments/payments.module';
import { DiscountCodeModule } from 'src/modules/promotions/discount-code.module';
import { ReferralModule } from 'src/modules/referral/referral.module';
import { UsersModule } from 'src/modules/users/users.module';
import { WalletModule } from 'src/modules/wallet/wallet.module';
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
