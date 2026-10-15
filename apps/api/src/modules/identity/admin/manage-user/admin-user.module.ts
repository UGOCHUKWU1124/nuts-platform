import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '@api/modules/auth/auth.module';
import { UsersModule } from '@api/modules/users/users.module';
import { AdminUsersController } from './admin-user.controller';

@Module({
  imports: [UsersModule, forwardRef(() => AuthModule)],
  controllers: [AdminUsersController],
})
export class AdminUsersModule {}
