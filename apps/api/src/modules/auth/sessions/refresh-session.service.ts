import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ROLE } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { StringValue } from 'ms';

import { PrismaService } from '@api/modules/infrastructure/prisma/prisma.service';

import {
  ADMIN_REFRESH_SELECT,
  USER_REFRESH_SELECT,
  VENDOR_REFRESH_SELECT,
  type UserAuthRecord,
} from '../auth.selects';
import type {
  AuthSession,
  AuthTokens,
  RefreshableAccount,
} from '../types/auth.types';
import type { RefreshJwtPayload } from '../types/refresh-jwt-payload.type';

type RotateRefreshSession = (
  refreshTokenHash: string,
  refreshId: string,
  expectedRefreshId: string,
) => Promise<number>;

@Injectable()
export class RefreshSessionService {
  private readonly jwtIssuer: string;
  private readonly accessAudience: string;
  private readonly refreshAudience: string;
  private readonly jwtSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: StringValue;
  private readonly refreshExpiresIn: StringValue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.jwtIssuer = configService.getOrThrow<string>('JWT_ISSUER');
    this.accessAudience = configService.getOrThrow<string>(
      'JWT_ACCESS_AUDIENCE',
    );
    this.refreshAudience = configService.getOrThrow<string>(
      'JWT_REFRESH_AUDIENCE',
    );
    this.jwtSecret = configService.getOrThrow<string>('JWT_SECRET');
    this.refreshSecret = configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessExpiresIn = configService.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    ) as StringValue;
    this.refreshExpiresIn = configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    ) as StringValue;
  }

  async issueUserSession(user: UserAuthRecord): Promise<AuthSession> {
    const tokens = await this.generateTokens(
      user.id,
      user.role,
      user.tokenVersion,
    );

    const result = await this.prisma.user.updateMany({
      where: { id: user.id, isActive: true },
      data: {
        refreshToken: this.hashRefreshToken(tokens.refreshId),
        refreshTokenId: tokens.refreshId,
      },
    });

    if (result.count !== 1) {
      throw new UnauthorizedException(
        'Unable to create authentication session',
      );
    }

    return { user: this.toAuthUserDto(user), tokens };
  }

  async refresh(payload: RefreshJwtPayload): Promise<AuthSession> {
    if (
      !payload.sub ||
      !payload.refreshId ||
      !payload.role ||
      !Object.values(ROLE).includes(payload.role)
    ) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    switch (payload.role) {
      case ROLE.ADMIN:
        return this.refreshAdmin(payload);
      case ROLE.VENDOR:
        return this.refreshVendor(payload);
      case ROLE.USER:
        return this.refreshUser(payload);
      default:
        throw new UnauthorizedException('Invalid refresh session');
    }
  }

  async revokeSession(
    userId: string,
    role: ROLE,
    activeOnly = false,
  ): Promise<void> {
    const data = {
      refreshToken: null,
      refreshTokenId: null,
      tokenVersion: { increment: 1 },
    };

    if (role === ROLE.ADMIN) {
      await this.prisma.admin.updateMany({
        where: activeOnly ? { id: userId, isActive: true } : { id: userId },
        data,
      });
      return;
    }

    if (role === ROLE.VENDOR) {
      await this.prisma.vendor.updateMany({
        where: activeOnly ? { id: userId, isActive: true } : { id: userId },
        data,
      });
      return;
    }

    await this.prisma.user.updateMany({
      where: activeOnly ? { id: userId, isActive: true } : { id: userId },
      data,
    });
  }

  private async refreshAdmin(payload: RefreshJwtPayload): Promise<AuthSession> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
      select: ADMIN_REFRESH_SELECT,
    });

    return this.rotateRefreshSession(
      admin,
      payload,
      async (refreshTokenHash, refreshId, expectedRefreshId) => {
        const result = await this.prisma.admin.updateMany({
          where: {
            id: payload.sub,
            refreshTokenId: expectedRefreshId,
            isActive: true,
          },
          data: { refreshToken: refreshTokenHash, refreshTokenId: refreshId },
        });
        return result.count;
      },
    );
  }

  private async refreshVendor(
    payload: RefreshJwtPayload,
  ): Promise<AuthSession> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: payload.sub },
      select: VENDOR_REFRESH_SELECT,
    });

    if (!vendor?.isApproved) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    return this.rotateRefreshSession(
      { ...vendor, role: ROLE.VENDOR },
      payload,
      async (refreshTokenHash, refreshId, expectedRefreshId) => {
        const result = await this.prisma.vendor.updateMany({
          where: {
            id: payload.sub,
            refreshTokenId: expectedRefreshId,
            isActive: true,
            isApproved: true,
          },
          data: { refreshToken: refreshTokenHash, refreshTokenId: refreshId },
        });
        return result.count;
      },
    );
  }

  private async refreshUser(payload: RefreshJwtPayload): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: USER_REFRESH_SELECT,
    });

    return this.rotateRefreshSession(
      user,
      payload,
      async (refreshTokenHash, refreshId, expectedRefreshId) => {
        const result = await this.prisma.user.updateMany({
          where: {
            id: payload.sub,
            refreshTokenId: expectedRefreshId,
            isActive: true,
          },
          data: { refreshToken: refreshTokenHash, refreshTokenId: refreshId },
        });
        return result.count;
      },
    );
  }

  private async rotateRefreshSession(
    account: RefreshableAccount | null,
    payload: RefreshJwtPayload,
    rotate: RotateRefreshSession,
  ): Promise<AuthSession> {
    if (
      !account ||
      account.role !== payload.role ||
      !account.isActive ||
      !account.refreshToken ||
      !account.refreshTokenId
    ) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    if (account.refreshTokenId !== payload.refreshId) {
      throw new UnauthorizedException(
        'Refresh session has already been rotated',
      );
    }

    const valid = await this.verifyRefreshTokenHash(
      payload.refreshId,
      account.refreshToken,
    );

    if (!valid) {
      await this.revokeSession(account.id, account.role);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(
      account.id,
      account.role,
      account.tokenVersion,
    );
    const updated = await rotate(
      this.hashRefreshToken(tokens.refreshId),
      tokens.refreshId,
      payload.refreshId,
    );

    if (updated !== 1) {
      throw new UnauthorizedException(
        'Refresh session has already been rotated',
      );
    }

    return { user: this.toAuthUserDto(account), tokens };
  }

  private async generateTokens(
    userId: string,
    role: ROLE,
    tokenVersion: number,
  ): Promise<AuthTokens> {
    const refreshId = randomBytes(32).toString('hex');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, role, tokenVersion },
        {
          secret: this.jwtSecret,
          expiresIn: this.accessExpiresIn,
          issuer: this.jwtIssuer,
          audience: this.accessAudience,
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, role, refreshId },
        {
          secret: this.refreshSecret,
          expiresIn: this.refreshExpiresIn,
          issuer: this.jwtIssuer,
          audience: this.refreshAudience,
        },
      ),
    ]);

    return { accessToken, refreshToken, refreshId };
  }

  private hashRefreshToken(refreshId: string): string {
    return createHmac('sha256', this.refreshSecret)
      .update(refreshId)
      .digest('hex');
  }

  private async verifyRefreshTokenHash(
    refreshId: string,
    storedHash: string,
  ): Promise<boolean> {
    if (storedHash.startsWith('$2')) {
      return bcrypt.compare(refreshId, storedHash);
    }

    const expectedHash = this.hashRefreshToken(refreshId);

    return (
      storedHash.length === expectedHash.length &&
      timingSafeEqual(Buffer.from(storedHash), Buffer.from(expectedHash))
    );
  }

  private toAuthUserDto(account: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }): AuthSession['user'] {
    return {
      id: account.id,
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName,
    };
  }
}
