import { Module } from '@nestjs/common';
import { AuthModule } from '@api/modules/auth/auth.module';
import { PrismaModule } from '@api/modules/infrastructure/prisma/prisma.module';
import { SecurityModule } from '@api/modules/security/security.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    SecurityModule,
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService],
})
export class AdminAuthModule {}
