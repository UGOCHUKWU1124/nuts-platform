import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ROLE } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { VENDOR_REFRESH_TOKEN_COOKIE } from '@api/modules/auth/constants/auth-cookies.constants';
import { jwtFromCookie } from '@api/modules/auth/utils/jwt-cookie.extractor';
import { PrismaService } from '@api/modules/infrastructure/prisma/prisma.service';

export type VendorRefreshTokenPayload = {
  sub: string;
  email: string;
  refreshId: string;
  role?: string;
  type?: 'vendor';
};

@Injectable()
export class VendorRefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'vendor-refresh-token',
) {
  private readonly refreshSecret: string;

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const refreshSecret =
      configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        jwtFromCookie(VENDOR_REFRESH_TOKEN_COOKIE),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromBodyField('refreshToken'),
      ]),
      secretOrKey: refreshSecret,
      ignoreExpiration: false,
      passReqToCallback: true,
      issuer: configService.getOrThrow<string>('JWT_ISSUER'),
      audience: configService.getOrThrow<string>('JWT_REFRESH_AUDIENCE'),
      algorithms: ['HS256'],
    });
    this.refreshSecret = refreshSecret;
  }

  async validate(_req: Request, payload: VendorRefreshTokenPayload) {
    const isVendorRole =
      payload.role === ROLE.VENDOR ||
      payload.role === 'vendor' ||
      payload.type === 'vendor';

    if (!isVendorRole) {
      return null;
    }

    if (!payload.refreshId) {
      return null;
    }

    // Only select the fields needed — avoids transferring password, full JWT, etc.
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        refreshToken: true,
        refreshTokenId: true,
        isActive: true,
        isApproved: true,
      },
    });

    if (!vendor?.refreshToken || !vendor.refreshTokenId) {
      return null;
    }

    if (!vendor.isActive || !vendor.isApproved) {
      return null;
    }

    // Fast pre-screen: plain-string ID comparison before cryptographic verification.
    if (vendor.refreshTokenId !== payload.refreshId) {
      return null;
    }

    // Cryptographic check:
    // New tokens use HMAC-SHA256 with constant-time comparison (0.005ms).
    // Legacy tokens starting with $2 (bcrypt) are supported for backward compatibility.
    let matches = false;
    if (vendor.refreshToken.startsWith('$2')) {
      matches = await bcrypt.compare(payload.refreshId, vendor.refreshToken);
    } else {
      const expectedHash = createHmac('sha256', this.refreshSecret)
        .update(payload.refreshId)
        .digest('hex');

      matches =
        vendor.refreshToken.length === expectedHash.length &&
        timingSafeEqual(
          Buffer.from(vendor.refreshToken),
          Buffer.from(expectedHash),
        );
    }

    if (!matches) {
      return null;
    }

    return {
      id: payload.sub,
      email: vendor.email,
      type: payload.type,
      refreshId: payload.refreshId,
    };
  }
}
