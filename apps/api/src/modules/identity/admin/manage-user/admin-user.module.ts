import { Module } from '@nestjs/common';
import { UsersModule } from '@api/modules/users/users.module';
import { AdminUsersController } from './admin-user.controller';

@Module({
  imports: [UsersModule],
  controllers: [AdminUsersController],
})
export class AdminUsersModule {}
