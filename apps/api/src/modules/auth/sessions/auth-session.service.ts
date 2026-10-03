import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ROLE } from '@prisma/client';
import { PrismaService } from '@api/modules/infrastructure/prisma/prisma.service';

import type { AuthenticatedUser } from '../types/authenticated-user.type';
import type { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class AuthSessionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * JWT signature verification proves that the token was issued by us.
   *
   * It does NOT prove that:
   * - the account still exists;
   * - the account is active;
   * - the token has not been revoked through tokenVersion;
   * - the account still belongs to the expected role.
   *
   * Therefore these checks remain authoritative in the database on every request.
   * This keeps revocation immediate and works consistently across API instances.
   */
  async validateAccessToken(
    payload: JwtPayload,
    expectedRole?: ROLE,
  ): Promise<AuthenticatedUser> {
    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      !Object.values(ROLE).includes(payload.role) ||
      (expectedRole && payload.role !== expectedRole) ||
      !Number.isInteger(payload.tokenVersion) ||
      payload.tokenVersion < 0
    ) {
      throw new UnauthorizedException('Invalid access token');
    }

    const account = await this.findAccount(payload.sub, payload.role);

    if (!account || !account.isActive) {
      throw new UnauthorizedException('Invalid authentication');
    }

    if (
      payload.role === ROLE.VENDOR &&
      (!('isApproved' in account) || !account.isApproved)
    ) {
      throw new UnauthorizedException('Vendor account is not approved');
    }

    /**
     * Never authorize purely from the role embedded in the JWT.
     *
     * The current database role remains the authoritative account state.
     */
    if (account.role !== payload.role) {
      throw new UnauthorizedException('Invalid authentication context');
    }

    /**
     * This is the server-side revocation mechanism.
     *
     * Password reset, logout, forced logout, or another security event
     * increments tokenVersion and immediately invalidates old tokens.
     */
    if (account.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session has been revoked');
    }

    return this.toAuthenticatedUser(account);
  }

  private async findAccount(userId: string, role: ROLE) {
    /**
     * Each query is by primary key.
     *
     * We intentionally select only fields required for authentication.
     * Passwords and refresh secrets are never loaded during access-token
     * validation.
     */
    switch (role) {
      case ROLE.ADMIN:
        return this.prisma.admin.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            tokenVersion: true,
          },
        });

      case ROLE.VENDOR: {
        const vendor = await this.prisma.vendor.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
            isApproved: true,
            tokenVersion: true,
          },
        });
        if (!vendor) {
          return null;
        }
        return {
          ...vendor,
          role: ROLE.VENDOR,
        };
      }

      case ROLE.USER:
        return this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            tokenVersion: true,
          },
        });

      default:
        throw new UnauthorizedException('Invalid account role');
    }
  }

  private toAuthenticatedUser(account: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: ROLE;
  }): AuthenticatedUser {
    return {
      id: account.id,
      email: account.email,
      role: account.role,
      firstName: account.firstName,
      lastName: account.lastName,
    };
  }
}
