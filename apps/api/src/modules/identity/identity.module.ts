import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthModule } from './admin/auth/admin-auth.module';
import { AdminUsersModule } from './admin/manage-user/admin-user.module';
import { AdminVendorsModule } from './admin/manage-vendors/admin-vendors.module';
import { UsersModule } from './users/users.module';
import { VendorsModule } from './vendors/vendors.module';

/**
 * Identity Bounded Context Module
 *
 * Encapsulates authentication, identity lifecycle, customer accounts,
 * vendor identities, and administrative credentials.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    VendorsModule,
    AdminAuthModule,
    AdminUsersModule,
    AdminVendorsModule,
  ],
  exports: [
    AuthModule,
    UsersModule,
    VendorsModule,
    AdminAuthModule,
    AdminUsersModule,
    AdminVendorsModule,
  ],
})
export class IdentityModule {}
