import { Module } from '@nestjs/common';
import { PrismaModule } from '@api/modules/infrastructure/prisma/prisma.module';
import { DiscountCodeService } from './discount-code.service';

@Module({
  imports: [PrismaModule],
  providers: [DiscountCodeService],
  exports: [DiscountCodeService],
})
export class DiscountCodeModule {}
