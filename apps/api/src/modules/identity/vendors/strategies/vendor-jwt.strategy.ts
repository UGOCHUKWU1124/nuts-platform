import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ROLE } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthSessionService } from '@api/modules/auth/sessions/auth-session.service';
import { VENDOR_ACCESS_TOKEN_COOKIE } from '@api/modules/auth/constants/auth-cookies.constants';
import { jwtFromCookie } from '@api/modules/auth/utils/jwt-cookie.extractor';

export type VendorJwtPayload = {
  sub: string;
  role: ROLE;
  tokenVersion: number;
};

@Injectable()
export class VendorJwtStrategy extends PassportStrategy(
  Strategy,
  'vendor-jwt',
) {
  constructor(
    configService: ConfigService,
    private readonly authSessionService: AuthSessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        jwtFromCookie(VENDOR_ACCESS_TOKEN_COOKIE),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      issuer: configService.getOrThrow<string>('JWT_ISSUER'),
      audience: configService.getOrThrow<string>('JWT_ACCESS_AUDIENCE'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: VendorJwtPayload) {
    const user = await this.authSessionService.validateAccessToken(
      payload,
      ROLE.VENDOR,
    );

    return {
      id: user.id,
      email: user.email,
      type: 'vendor' as const,
      role: 'vendor' as const,
    };
  }
}
