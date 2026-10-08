import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AUTH_ACCESS_COOKIE } from '../../constants/auth-cookies.constants';
import { AuthSessionService } from '../../sessions/auth-session.service';
import type { JwtPayload } from '../../types/jwt-payload.type';
import { jwtFromCookie } from '../../utils/jwt-cookie.extractor';

function extractAccessToken(req: Request): string | null {
  if (!req) return null;

  // 1. Authorization: Bearer <token> header (Standard API contract)
  const authHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (authHeader) return authHeader;

  // 2. Standard HttpOnly access_token cookie
  return jwtFromCookie(AUTH_ACCESS_COOKIE)(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authSessionService: AuthSessionService,
  ) {
    const publicKey = config.get<string>('JWT_PUBLIC_KEY');
    const secret = config.get<string>('JWT_SECRET');

    super({
      jwtFromRequest: extractAccessToken,
      ignoreExpiration: false,
      secretOrKey: publicKey || secret || config.getOrThrow<string>('JWT_SECRET'),
      issuer: config.getOrThrow<string>('JWT_ISSUER'),
      audience: config.getOrThrow<string>('JWT_ACCESS_AUDIENCE'),
      algorithms: publicKey ? ['RS256'] : ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    return this.authSessionService.validateAccessToken(payload);
  }
}
