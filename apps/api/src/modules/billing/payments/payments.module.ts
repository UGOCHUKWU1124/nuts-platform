import { Module } from '@nestjs/common';
import { AuthModule } from '@api/modules/auth/auth.module';
import { MailModule } from '@api/modules/infrastructure/mail/mail.module';
import { ReferralModule } from '@api/modules/referral/referral.module';
import { UsersModule } from '@api/modules/users/users.module';
import { WalletModule } from '@api/modules/wallet/wallet.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [UsersModule, AuthModule, WalletModule, ReferralModule, MailModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
