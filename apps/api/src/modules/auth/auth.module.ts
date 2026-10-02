import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp/otp.service';
import { AuthSessionService } from './sessions/auth-session.service';

import { ReferralModule } from 'src/modules/referral/referral.module';
import { SecurityModule } from 'src/modules/security/security.module';

import { AuthCookiesModule } from './cookies/auth-cookie.module';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtStrategy } from './strategies/access/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/refresh/jwt-refresh.strategy';

@Module({
  imports: [
    AuthCookiesModule,
    ReferralModule,
    SecurityModule,

    PassportModule.register({
      session: false,
      defaultStrategy: 'jwt',
    }),

    JwtModule.registerAsync({
      inject: [ConfigService],

      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        issuer: config.getOrThrow<string>('JWT_ISSUER'),
        audience: config.getOrThrow<string>('JWT_ACCESS_AUDIENCE'),
      }),
    }),
  ],

  providers: [
    AuthService,
    OtpService,
    AuthSessionService,

    JwtStrategy,
    JwtRefreshStrategy,
    JwtRefreshGuard,
  ],

  controllers: [AuthController],

  exports: [
    AuthService,
    OtpService,
    AuthCookiesModule,
    JwtStrategy,
    JwtRefreshStrategy,
    JwtRefreshGuard,
  ],
})
export class AuthModule {}
