import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  ADMIN_ACCESS_TOKEN_COOKIE,
  USER_ACCESS_TOKEN_COOKIE,
  VENDOR_ACCESS_TOKEN_COOKIE,
} from '../../constants/auth-cookies.constants';
import { AuthSessionService } from '../../sessions/auth-session.service';
import type { JwtPayload } from '../../types/jwt-payload.type';
import { jwtFromCookie } from '../../utils/jwt-cookie.extractor';

function extractContextualAccessToken(req: Request): string | null {
  if (!req) return null;

  // 1. Explicit Authorization header takes highest priority
  const authHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (authHeader) return authHeader;

  const url = (req.originalUrl || req.url || '').toLowerCase();

  // 2. Strict cookie isolation based on route namespace:
  if (url.includes('/admin')) {
    return jwtFromCookie(ADMIN_ACCESS_TOKEN_COOKIE)(req);
  }

  if (url.includes('/vendor')) {
    return jwtFromCookie(VENDOR_ACCESS_TOKEN_COOKIE)(req);
  }

  // 3. All non-admin/non-vendor routes (storefront, cart, checkout, users) strictly use user cookie
  return jwtFromCookie(USER_ACCESS_TOKEN_COOKIE)(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authSessionService: AuthSessionService,
  ) {
    super({
      jwtFromRequest: extractContextualAccessToken,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      issuer: config.getOrThrow<string>('JWT_ISSUER'),
      audience: config.getOrThrow<string>('JWT_ACCESS_AUDIENCE'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    return this.authSessionService.validateAccessToken(payload);
  }
}
