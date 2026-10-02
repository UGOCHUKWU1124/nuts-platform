import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/modules/infrastructure/prisma/prisma.module';
import { AdminVendorsController } from './admin-vendors.controller';
import { AdminVendorsService } from './admin-vendors.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminVendorsController],
  providers: [AdminVendorsService],
})
export class AdminVendorsModule {}
