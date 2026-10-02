import { forwardRef, Module } from '@nestjs/common';
import { AuthCookiesModule } from 'src/modules/auth/auth-cookies.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { ReferralModule } from 'src/modules/referral/referral.module';
import { UserAccountCleanupService } from './user-account-cleanup.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthCookiesModule, forwardRef(() => AuthModule), ReferralModule],
  controllers: [UsersController],
  providers: [UsersService, UserAccountCleanupService],
  exports: [UsersService],
})
export class UsersModule {}
