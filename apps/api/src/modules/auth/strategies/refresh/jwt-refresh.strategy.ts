import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ROLE } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AUTH_REFRESH_COOKIE } from '../../constants/auth-cookies.constants';
import type { RefreshJwtPayload } from '../../types/refresh-jwt-payload.type';
import { jwtFromCookie } from '../../utils/jwt-cookie.extractor';
import type { Request } from 'express';

function extractRefreshToken(req: Request): string | null {
  if (!req) return null;

  // 1. Explicit body payload
  const body: unknown = req.body;
  if (
    typeof body === 'object' &&
    body !== null &&
    'refreshToken' in body &&
    typeof (body as Record<string, unknown>).refreshToken === 'string'
  ) {
    return (body as Record<string, string>).refreshToken;
  }

  // 2. Authorization: Bearer <refreshToken> header
  const bearerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (bearerToken) return bearerToken;

  // 3. Standard HttpOnly refresh_token cookie
  return jwtFromCookie(AUTH_REFRESH_COOKIE)(req);
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: extractRefreshToken,
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
      typeof payload.refreshId !== 'string' ||
      (payload.sessionId !== undefined &&
        (typeof payload.sessionId !== 'string' ||
          payload.sessionId.length === 0))
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return payload;
  }
}
