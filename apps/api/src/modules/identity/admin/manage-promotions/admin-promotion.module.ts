import { Module } from '@nestjs/common';
import { DiscountCodeModule } from '@api/modules/promotions/discount-code.module';
import { AdminDiscountCodesController } from './admin-discount-codes.controller';

@Module({
  imports: [DiscountCodeModule],
  controllers: [AdminDiscountCodesController],
})
export class AdminPromotionModule {}
