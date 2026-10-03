import { Module } from '@nestjs/common';
import { AdminOrdersModule } from '../identity/admin/manage-orders/admin-order.module';
import { AdminPromotionModule } from '../identity/admin/manage-promotions/admin-promotion.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';

/**
 * Checkout Bounded Context Module
 *
 * Encapsulates shopping cart state, order workflows, checkout validation,
 * promo code redemption, and administrative order handling.
 */
@Module({
  imports: [CartModule, OrdersModule, AdminOrdersModule, AdminPromotionModule],
  exports: [CartModule, OrdersModule, AdminOrdersModule, AdminPromotionModule],
})
export class CheckoutModule {}
