import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ROLE } from '@prisma/client';
import { Strategy } from 'passport-jwt';
import { AUTH_REFRESH_COOKIE } from '../../constants/auth-cookies.constants';
import type { RefreshJwtPayload } from '../../types/refresh-jwt-payload.type';
import { jwtFromCookie } from '../../utils/jwt-cookie.extractor';
import type { Request } from 'express';

function extractRefreshToken(req: Request): string | null {
  if (!req) return null;

  // Standard HttpOnly refreshToken cookie per OWASP token delivery standard
  return (
    jwtFromCookie(AUTH_REFRESH_COOKIE)(req) ??
    jwtFromCookie('refresh_token')(req)
  );
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
