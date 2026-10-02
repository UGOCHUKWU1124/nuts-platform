import { Module } from '@nestjs/common';
import { UserWalletController } from './user-wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  controllers: [UserWalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
