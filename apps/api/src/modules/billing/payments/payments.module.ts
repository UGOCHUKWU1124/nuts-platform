import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { MailModule } from 'src/modules/infrastructure/mail/mail.module';
import { ReferralModule } from 'src/modules/referral/referral.module';
import { UsersModule } from 'src/modules/users/users.module';
import { WalletModule } from 'src/modules/wallet/wallet.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [UsersModule, AuthModule, WalletModule, ReferralModule, MailModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
