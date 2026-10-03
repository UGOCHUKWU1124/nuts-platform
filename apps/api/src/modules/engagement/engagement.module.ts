import { Module } from '@nestjs/common';
import { ReferralModule } from './referral/referral.module';
import { ReviewsModule } from './reviews/reviews.module';
import { WishlistModule } from './wishlist/wishlist.module';

/**
 * Engagement Bounded Context Module
 *
 * Encapsulates customer reviews and ratings, wishlists, saved products,
 * and peer-to-peer referral and affiliate tracking.
 */
@Module({
  imports: [ReviewsModule, WishlistModule, ReferralModule],
  exports: [ReviewsModule, WishlistModule, ReferralModule],
})
export class EngagementModule {}
