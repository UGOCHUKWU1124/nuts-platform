import { Module } from '@nestjs/common';
import { DiscountCodeModule } from 'src/modules/promotions/discount-code.module';
import { UsersModule } from 'src/modules/users/users.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [UsersModule, DiscountCodeModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
