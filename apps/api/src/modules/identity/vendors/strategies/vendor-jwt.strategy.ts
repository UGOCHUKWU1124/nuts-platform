import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ROLE } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { VENDOR_ACCESS_TOKEN_COOKIE } from 'src/modules/auth/constants/auth-cookies.constants';
import { jwtFromCookie } from 'src/modules/auth/utils/jwt-cookie.extractor';

export type VendorJwtPayload = {
  sub: string;
  email: string;
  role?: string;
  type?: 'vendor';
};

@Injectable()
export class VendorJwtStrategy extends PassportStrategy(
  Strategy,
  'vendor-jwt',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        jwtFromCookie(VENDOR_ACCESS_TOKEN_COOKIE),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow('JWT_SECRET'),
    });
  }

  validate(payload: VendorJwtPayload) {
    const isVendorRole =
      payload.role === ROLE.VENDOR ||
      payload.role === 'vendor' ||
      payload.type === 'vendor';

    if (!isVendorRole) {
      return null;
    }

    return {
      id: payload.sub,
      email: payload.email,
      type: 'vendor',
      role: 'vendor',
    };
  }
}
