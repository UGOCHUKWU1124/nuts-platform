import { Module } from '@nestjs/common';
import { PaymentsModule } from './payments/payments.module';
import { WalletModule } from './wallets/wallet.module';

/**
 * Billing Bounded Context Module
 *
 * Encapsulates payment provider integration, customer balance wallets,
 * and ledger transactions. Paystack webhooks share the payment service's
 * signature verification and idempotent payment transition.
 */
@Module({
  imports: [PaymentsModule, WalletModule],
  exports: [PaymentsModule, WalletModule],
})
export class BillingModule {}
