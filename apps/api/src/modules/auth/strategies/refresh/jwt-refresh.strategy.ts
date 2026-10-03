import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ROLE } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  ADMIN_REFRESH_TOKEN_COOKIE,
  USER_REFRESH_TOKEN_COOKIE,
  VENDOR_REFRESH_TOKEN_COOKIE,
} from '../../constants/auth-cookies.constants';
import type { RefreshJwtPayload } from '../../types/refresh-jwt-payload.type';
import { jwtFromCookie } from '../../utils/jwt-cookie.extractor';

import type { Request } from 'express';

function extractContextualRefreshToken(req: Request): string | null {
  if (!req) return null;

  // 1. Explicit body or bearer header token
  const body: unknown = req.body;
  const bodyToken =
    typeof body === 'object' &&
    body !== null &&
    'refreshToken' in body &&
    typeof body.refreshToken === 'string'
      ? body.refreshToken
      : null;
  if (bodyToken) return bodyToken;

  const bearerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (bearerToken) return bearerToken;

  const url = (req.originalUrl || req.url || '').toLowerCase();

  // 2. Strict refresh cookie isolation based on route namespace:
  if (url.includes('/admin')) {
    return jwtFromCookie(ADMIN_REFRESH_TOKEN_COOKIE)(req);
  }

  if (url.includes('/vendor')) {
    return jwtFromCookie(VENDOR_REFRESH_TOKEN_COOKIE)(req);
  }

  // 3. User refresh endpoint strictly reads user refresh cookie
  return jwtFromCookie(USER_REFRESH_TOKEN_COOKIE)(req);
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: extractContextualRefreshToken,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      issuer: config.getOrThrow<string>('JWT_ISSUER'),
      audience: config.getOrThrow<string>('JWT_REFRESH_AUDIENCE'),
      algorithms: ['HS256'],
    });
  }

  validate(payload: RefreshJwtPayload): RefreshJwtPayload {
    if (
      !Object.values(ROLE).includes(payload.role) ||
      typeof payload.sub !== 'string' ||
      typeof payload.refreshId !== 'string'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return payload;
  }
}
