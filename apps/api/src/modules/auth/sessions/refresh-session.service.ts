import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ROLE } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
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
    const sessionId = randomUUID();
    const tokens = await this.generateTokens(
      user.id,
      user.role,
      user.tokenVersion,
      sessionId,
    );

    await this.prisma.userAuthSession.deleteMany({
      where: { userId: user.id, expiresAt: { lte: new Date() } },
    });
    await this.prisma.$transaction(async (tx) => {
      // Keep the legacy pointer updated while older API instances may still run.
      const account = await tx.user.updateMany({
        where: {
          id: user.id,
          isActive: true,
          tokenVersion: user.tokenVersion,
        },
        data: {
          refreshToken: this.hashRefreshToken(tokens.refreshId),
          refreshTokenId: tokens.refreshId,
        },
      });
      if (account.count !== 1) {
        throw new UnauthorizedException(
          'Unable to create authentication session',
        );
      }
      await tx.userAuthSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenVersion: user.tokenVersion,
          refreshToken: this.hashRefreshToken(tokens.refreshId),
          refreshTokenId: tokens.refreshId,
          expiresAt: this.getRefreshExpiresAt(tokens.refreshToken),
        },
      });
    });

    return { user: this.toAuthUserDto(user), tokens };
  }

  async refresh(payload: RefreshJwtPayload): Promise<AuthSession> {
    if (
      !payload.sub ||
      !payload.refreshId ||
      !payload.role ||
      !Object.values(ROLE).includes(payload.role) ||
      (payload.sessionId !== undefined &&
        (typeof payload.sessionId !== 'string' ||
          payload.sessionId.length === 0))
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

  async revokeUserSession(userId: string, sessionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.userAuthSession.findFirst({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
        },
        select: { refreshTokenId: true },
      });
      if (!session) return;

      const revoked = await tx.userAuthSession.updateMany({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          refreshToken: null,
          refreshTokenId: null,
        },
      });
      if (revoked.count !== 1 || !session.refreshTokenId) return;

      await tx.user.updateMany({
        where: { id: userId, refreshTokenId: session.refreshTokenId },
        data: { refreshToken: null, refreshTokenId: null },
      });
    });
  }

  async revokeUserSessionByRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    let payload: RefreshJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshJwtPayload>(
        refreshToken,
        {
          secret: this.refreshSecret,
          issuer: this.jwtIssuer,
          audience: this.refreshAudience,
          algorithms: ['HS256'],
          ignoreExpiration: true,
        },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        ['JsonWebTokenError', 'NotBeforeError', 'TokenExpiredError'].includes(
          error.name,
        )
      ) {
        return;
      }
      throw error;
    }

    if (
      payload.sub !== userId ||
      payload.role !== ROLE.USER ||
      typeof payload.refreshId !== 'string'
    ) {
      return;
    }

    const session = payload.sessionId
      ? await this.prisma.userAuthSession.findUnique({
          where: { id: payload.sessionId },
        })
      : await this.prisma.userAuthSession.findUnique({
          where: { refreshTokenId: payload.refreshId },
        });

    if (session?.userId === userId) {
      await this.revokeUserSession(userId, session.id);
    }
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
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    let session = payload.sessionId
      ? await this.prisma.userAuthSession.findUnique({
          where: { id: payload.sessionId },
        })
      : await this.prisma.userAuthSession.findUnique({
          where: { refreshTokenId: payload.refreshId },
        });

    if (
      !session &&
      !payload.sessionId &&
      user.refreshToken &&
      user.refreshTokenId === payload.refreshId
    ) {
      session = await this.prisma.userAuthSession.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          tokenVersion: user.tokenVersion,
          refreshToken: user.refreshToken,
          refreshTokenId: user.refreshTokenId,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    if (
      !session ||
      session.userId !== user.id ||
      (payload.sessionId !== undefined && session.id !== payload.sessionId) ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.tokenVersion !== user.tokenVersion
    ) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    if (session.refreshTokenId !== payload.refreshId || !session.refreshToken) {
      throw new UnauthorizedException(
        'Refresh session has already been rotated',
      );
    }

    const valid = await this.verifyRefreshTokenHash(
      payload.refreshId,
      session.refreshToken,
    );
    if (!valid) {
      await this.revokeUserSession(user.id, session.id);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.role,
      user.tokenVersion,
      session.id,
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      const sessionUpdate = await tx.userAuthSession.updateMany({
        where: {
          id: session.id,
          userId: user.id,
          tokenVersion: user.tokenVersion,
          refreshTokenId: payload.refreshId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          refreshToken: this.hashRefreshToken(tokens.refreshId),
          refreshTokenId: tokens.refreshId,
          expiresAt: this.getRefreshExpiresAt(tokens.refreshToken),
        },
      });
      if (sessionUpdate.count !== 1) return 0;

      // Older API instances still rotate the account-level refresh pointer.
      const accountUpdate = await tx.user.updateMany({
        where: {
          id: user.id,
          isActive: true,
          tokenVersion: user.tokenVersion,
        },
        data: {
          refreshToken: this.hashRefreshToken(tokens.refreshId),
          refreshTokenId: tokens.refreshId,
        },
      });
      if (accountUpdate.count !== 1) {
        throw new UnauthorizedException('Invalid refresh session');
      }
      return sessionUpdate.count;
    });

    if (updated !== 1) {
      throw new UnauthorizedException(
        'Refresh session has already been rotated',
      );
    }

    return { user: this.toAuthUserDto(user), tokens };
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
    sessionId?: string,
  ): Promise<AuthTokens> {
    const refreshId = randomBytes(32).toString('hex');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: userId,
          role,
          tokenVersion,
          ...(sessionId ? { sessionId } : {}),
        },
        {
          secret: this.jwtSecret,
          expiresIn: this.accessExpiresIn,
          issuer: this.jwtIssuer,
          audience: this.accessAudience,
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, role, refreshId, ...(sessionId ? { sessionId } : {}) },
        {
          secret: this.refreshSecret,
          expiresIn: this.refreshExpiresIn,
          issuer: this.jwtIssuer,
          audience: this.refreshAudience,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      refreshId,
      ...(sessionId ? { sessionId } : {}),
    };
  }

  private getRefreshExpiresAt(refreshToken: string): Date {
    const payload: unknown = this.jwtService.decode(refreshToken);
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('exp' in payload) ||
      typeof payload.exp !== 'number'
    ) {
      throw new Error('Generated refresh token is missing its expiry');
    }
    return new Date(payload.exp * 1000);
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
