import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, ROLE } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { StringValue } from 'ms';

import { EmailService } from 'src/modules/infrastructure/mail/email.service';
import { PrismaService } from 'src/modules/infrastructure/prisma/prisma.service';
import { ReferralService } from 'src/modules/referral/referral.service';
import { AccountLockService } from 'src/modules/security/services/account-lock.service';
import { AuditLogService } from 'src/modules/shared/audit-log/audit-log.service';

import { AuthUserDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { OtpService } from './otp/otp.service';

import {
  BCRYPT_SALT_ROUNDS,
  DUMMY_PASSWORD_HASH,
} from 'src/modules/shared/constants/bcrypt.constants';
import type { RefreshJwtPayload } from './types/refresh-jwt-payload.type';

const USER_AUTH_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  tokenVersion: true,
} as const satisfies Prisma.UserSelect;

const USER_LOGIN_SELECT = {
  ...USER_AUTH_SELECT,
  password: true,
  isActive: true,
} as const satisfies Prisma.UserSelect;

const USER_REFRESH_SELECT = {
  ...USER_AUTH_SELECT,
  isActive: true,
  refreshToken: true,
  refreshTokenId: true,
} as const satisfies Prisma.UserSelect;

type AuthUserData = Prisma.UserGetPayload<{
  select: typeof USER_AUTH_SELECT;
}>;

type LoginUserData = Prisma.UserGetPayload<{
  select: typeof USER_LOGIN_SELECT;
}>;

type RefreshUserData = Prisma.UserGetPayload<{
  select: typeof USER_REFRESH_SELECT;
}>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshId: string;
}

export interface AuthSession {
  user: AuthUserDto;
  tokens: AuthTokens;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

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
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
    private readonly emailService: EmailService,
    private readonly auditLog: AuditLogService,
    private readonly referralService: ReferralService,
    private readonly accountLockService: AccountLockService,
  ) {
    this.jwtIssuer = this.configService.getOrThrow<string>('JWT_ISSUER');

    this.accessAudience = this.configService.getOrThrow<string>(
      'JWT_ACCESS_AUDIENCE',
    );

    this.refreshAudience = this.configService.getOrThrow<string>(
      'JWT_REFRESH_AUDIENCE',
    );

    this.jwtSecret = this.configService.getOrThrow<string>('JWT_SECRET');

    this.refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    this.accessExpiresIn = this.configService.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    ) as StringValue;

    this.refreshExpiresIn = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    ) as StringValue;
  }

  // ---------------------------------------------------------------------------
  // REGISTER
  // ---------------------------------------------------------------------------

  async register(
    dto: RegisterDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthSession> {
    const email = this.normalizeEmail(dto.email);

    // OTP verification happens before the database transaction because
    // it is an external/stateful operation and does not need DB rollback.
    await this.otpService.verifyOtp(email, dto.otpCode, 'registration');

    // Validate the referral code before creating the user.
    // We only keep the IDs required inside the transaction.
    const referral = dto.referralCode
      ? await this.referralService.validateReferralCode(dto.referralCode, email)
      : null;

    const password = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    try {
      /*
       * Everything that creates the user's initial database state belongs
       * to ONE transaction.
       *
       * If wallet creation, address creation, referral creation, or referral
       * code creation fails, the user itself is rolled back.
       *
       * We intentionally do NOT use Serializable here. The database UNIQUE
       * constraints already protect things such as duplicate email/code,
       * while Serializable would add unnecessary contention to registration.
       */
      const user = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email,
            password,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
          },
          select: USER_AUTH_SELECT,
        });

        await tx.userWallet.create({
          data: {
            userId: createdUser.id,
          },
        });

        if (dto.shippingAddress) {
          await tx.shippingAddress.create({
            data: {
              userId: createdUser.id,
              fullName: dto.shippingAddress.fullName,
              phone: dto.shippingAddress.phone,
              street: dto.shippingAddress.street,
              city: dto.shippingAddress.city,
              state: dto.shippingAddress.state,
              country: dto.shippingAddress.country ?? 'Nigeria',
              isDefault: true,
            },
          });
        }

        /*
         * Create the user's own referral code using the SAME transaction
         * client. This means the code cannot survive if registration fails.
         */
        await this.referralService.createReferralCode(tx, createdUser.id);

        /*
         * If a referral was supplied, create the relationship using the
         * transaction client as well.
         *
         * Do not call this.prisma here. That would escape the transaction.
         */
        if (referral) {
          await this.referralService.applyReferralAtSignupById(
            tx,
            createdUser.id,
            referral.id,
            referral.userId,
          );
        }

        return createdUser;
      });

      /*
       * Session creation happens AFTER registration commits.
       *
       * JWT generation and refresh-token persistence are authentication
       * concerns and are intentionally outside the registration transaction.
       */
      const session = await this.issueSession(user);

      this.fireAndForget(
        this.auditLog.log({
          action: 'USER_REGISTER',
          entity: 'User',
          entityId: user.id,
          userId: user.id,
          payload: {
            hasReferral: Boolean(referral),
          },
          ipAddress,
          userAgent,
        }),
        'registration audit log',
      );

      this.fireAndForget(
        this.emailService.sendWelcomeEmail(email, dto.firstName ?? ''),
        'welcome email',
      );

      return session;
    } catch (error) {
      if (this.isUserEmailUniqueViolation(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }

      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------------------------

  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthSession> {
    const email = this.normalizeEmail(dto.email);
    const identifier = `email:${email}`;

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: USER_LOGIN_SELECT,
    });

    const passwordMatches = user
      ? await bcrypt.compare(dto.password, user.password)
      : await this.fakePasswordCheck(dto.password);

    if (!user || !passwordMatches || !user.isActive) {
      this.fireAndForget(
        this.accountLockService.recordFailedAttempt(identifier),
        'failed login attempt',
      );

      this.fireAndForget(
        this.auditLog.log({
          action: 'USER_LOGIN_FAILED',
          entity: 'User',
          entityId: user?.id,
          payload: { credentialType: 'email' },
          ipAddress,
          userAgent,
        }),
        'failed-login audit log',
      );

      throw new UnauthorizedException('Invalid credentials');
    }

    this.fireAndForget(
      this.accountLockService.resetAttempts(identifier),
      'reset login attempts',
    );

    if (bcrypt.getRounds(user.password) < BCRYPT_SALT_ROUNDS) {
      void this.upgradePasswordHash(user.id, user.password, dto.password);
    }

    const session = await this.issueSession(user);

    this.fireAndForget(
      this.auditLog.log({
        action: 'USER_LOGIN',
        entity: 'User',
        entityId: user.id,
        userId: user.id,
        payload: { role: user.role },
        ipAddress,
        userAgent,
      }),
      'login audit log',
    );

    return session;
  }

  // ---------------------------------------------------------------------------
  // REFRESH
  // ---------------------------------------------------------------------------

  async refresh(payload: RefreshJwtPayload): Promise<AuthSession> {
    if (!payload.sub || !payload.refreshId || !payload.role) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    if (payload.role === ROLE.ADMIN) {
      const admin = await this.prisma.admin.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          tokenVersion: true,
          refreshToken: true,
          refreshTokenId: true,
        },
      });

      if (
        !admin ||
        !admin.isActive ||
        !admin.refreshToken ||
        !admin.refreshTokenId
      ) {
        throw new UnauthorizedException('Invalid refresh session');
      }

      if (admin.refreshTokenId !== payload.refreshId) {
        throw new UnauthorizedException(
          'Refresh session has already been rotated',
        );
      }

      const valid = await this.verifyRefreshTokenHash(
        payload.refreshId,
        admin.refreshToken,
      );

      if (!valid) {
        await this.prisma.admin.updateMany({
          where: { id: admin.id },
          data: { refreshToken: null, refreshTokenId: null },
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      const tokens = await this.generateTokens(
        admin.id,
        admin.email,
        admin.role,
        admin.tokenVersion,
      );

      const refreshTokenHash = this.hashRefreshToken(tokens.refreshId);

      const result = await this.prisma.admin.updateMany({
        where: {
          id: admin.id,
          refreshTokenId: payload.refreshId,
          isActive: true,
        },
        data: {
          refreshToken: refreshTokenHash,
          refreshTokenId: tokens.refreshId,
        },
      });

      if (result.count !== 1) {
        throw new UnauthorizedException(
          'Refresh session has already been rotated',
        );
      }

      return {
        user: {
          id: admin.id,
          email: admin.email,
          firstName: admin.firstName,
          lastName: admin.lastName,
        },
        tokens,
      };
    }

    if (payload.role === ROLE.VENDOR) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          tokenVersion: true,
          refreshToken: true,
          refreshTokenId: true,
        },
      });

      if (
        !vendor ||
        !vendor.isActive ||
        !vendor.refreshToken ||
        !vendor.refreshTokenId
      ) {
        throw new UnauthorizedException('Invalid refresh session');
      }

      if (vendor.refreshTokenId !== payload.refreshId) {
        throw new UnauthorizedException(
          'Refresh session has already been rotated',
        );
      }

      const valid = await this.verifyRefreshTokenHash(
        payload.refreshId,
        vendor.refreshToken,
      );

      if (!valid) {
        await this.prisma.vendor.updateMany({
          where: { id: vendor.id },
          data: { refreshToken: null, refreshTokenId: null },
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      const tokens = await this.generateTokens(
        vendor.id,
        vendor.email,
        ROLE.VENDOR,
        vendor.tokenVersion,
      );

      const refreshTokenHash = this.hashRefreshToken(tokens.refreshId);

      const result = await this.prisma.vendor.updateMany({
        where: {
          id: vendor.id,
          refreshTokenId: payload.refreshId,
          isActive: true,
        },
        data: {
          refreshToken: refreshTokenHash,
          refreshTokenId: tokens.refreshId,
        },
      });

      if (result.count !== 1) {
        throw new UnauthorizedException(
          'Refresh session has already been rotated',
        );
      }

      return {
        user: {
          id: vendor.id,
          email: vendor.email,
          firstName: vendor.firstName,
          lastName: vendor.lastName,
        },
        tokens,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: USER_REFRESH_SELECT,
    });

    if (
      !user ||
      user.role !== ROLE.USER ||
      !user.isActive ||
      !user.refreshToken ||
      !user.refreshTokenId
    ) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    if (user.refreshTokenId !== payload.refreshId) {
      throw new UnauthorizedException(
        'Refresh session has already been rotated',
      );
    }

    const valid = await this.verifyRefreshTokenHash(
      payload.refreshId,
      user.refreshToken,
    );

    if (!valid) {
      await this.revokeRefreshSession(user.id);

      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.tokenVersion,
    );

    const refreshTokenHash = this.hashRefreshToken(tokens.refreshId);

    /*
     * Conditional update makes token rotation atomic.
     *
     * If another request already rotated this session,
     * refreshTokenId no longer matches and count becomes 0.
     */
    const result = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        refreshTokenId: payload.refreshId,
        isActive: true,
      },
      data: {
        refreshToken: refreshTokenHash,
        refreshTokenId: tokens.refreshId,
      },
    });

    if (result.count !== 1) {
      throw new UnauthorizedException(
        'Refresh session has already been rotated',
      );
    }

    return {
      user: this.toAuthUserDto(user),
      tokens,
    };
  }

  // ---------------------------------------------------------------------------
  // LOGOUT
  // ---------------------------------------------------------------------------

  async logout(
    userId: string,
    role: ROLE = ROLE.USER,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    if (role === ROLE.ADMIN) {
      await this.prisma.admin.updateMany({
        where: { id: userId, isActive: true },
        data: {
          refreshToken: null,
          refreshTokenId: null,
          tokenVersion: { increment: 1 },
        },
      });
    } else if (role === ROLE.VENDOR) {
      await this.prisma.vendor.updateMany({
        where: { id: userId, isActive: true },
        data: {
          refreshToken: null,
          refreshTokenId: null,
          tokenVersion: { increment: 1 },
        },
      });
    } else {
      await this.prisma.user.updateMany({
        where: { id: userId, isActive: true },
        data: {
          refreshToken: null,
          refreshTokenId: null,
          tokenVersion: { increment: 1 },
        },
      });
    }

    this.fireAndForget(
      this.auditLog.log({
        action: 'USER_LOGOUT',
        entity: 'User',
        entityId: userId,
        userId,
        ipAddress,
        userAgent,
      }),
      'logout audit log',
    );
  }

  // ---------------------------------------------------------------------------
  // OTP
  // ---------------------------------------------------------------------------

  async requestRegistrationOtp(dto: RequestOtpDto): Promise<void> {
    const email = this.normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (user) {
      throw new ConflictException('An account with this email already exists');
    }

    await this.otpService.createOtp(email, 'registration');
  }

  async requestPasswordResetOtp(dto: RequestOtpDto): Promise<void> {
    const email = this.normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      return;
    }

    await this.otpService.createOtp(email, 'password-reset');
  }

  // ---------------------------------------------------------------------------
  // PASSWORD RESET
  // ---------------------------------------------------------------------------

  async resetPassword(
    dto: ResetPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const email = this.normalizeEmail(dto.email);

    await this.otpService.verifyOtp(email, dto.otpCode, 'password-reset');

    const password = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);

    try {
      const user = await this.prisma.user.update({
        where: { email },
        data: {
          password,
          refreshToken: null,
          refreshTokenId: null,
          tokenVersion: {
            increment: 1,
          },
        },
        select: {
          id: true,
          firstName: true,
        },
      });

      this.fireAndForget(
        this.auditLog.log({
          action: 'USER_RESET_PASSWORD',
          entity: 'User',
          entityId: user.id,
          userId: user.id,
          ipAddress,
          userAgent,
        }),
        'password-reset audit log',
      );

      this.fireAndForget(
        this.emailService.sendPasswordResetSuccessEmail(
          email,
          user.firstName ?? '',
        ),
        'password-reset confirmation email',
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new UnauthorizedException('Invalid password reset request');
      }

      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // SESSION
  // ---------------------------------------------------------------------------

  private async issueSession(user: AuthUserData): Promise<AuthSession> {
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.tokenVersion,
    );

    const refreshTokenHash = this.hashRefreshToken(tokens.refreshId);

    const result = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        isActive: true,
      },
      data: {
        refreshToken: refreshTokenHash,
        refreshTokenId: tokens.refreshId,
      },
    });

    if (result.count !== 1) {
      throw new UnauthorizedException(
        'Unable to create authentication session',
      );
    }

    return {
      user: this.toAuthUserDto(user),
      tokens,
    };
  }

  // ---------------------------------------------------------------------------
  // TOKENS
  // ---------------------------------------------------------------------------

  private async generateTokens(
    userId: string,
    email: string,
    role: ROLE,
    tokenVersion: number,
  ): Promise<AuthTokens> {
    const refreshId = randomBytes(32).toString('hex');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: userId,
          role,
          tokenVersion,
        },
        {
          secret: this.jwtSecret,
          expiresIn: this.accessExpiresIn,
          issuer: this.jwtIssuer,
          audience: this.accessAudience,
        },
      ),

      this.jwtService.signAsync(
        {
          sub: userId,
          role,
          refreshId,
        },
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
    };
  }

  // ---------------------------------------------------------------------------
  // PASSWORD HASH
  // ---------------------------------------------------------------------------

  private async upgradePasswordHash(
    userId: string,
    oldHash: string,
    password: string,
  ): Promise<void> {
    try {
      const newHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

      await this.prisma.user.updateMany({
        where: {
          id: userId,
          password: oldHash,
        },
        data: {
          password: newHash,
        },
      });
    } catch (error) {
      this.logger.warn('Failed to upgrade password hash', error);
    }
  }

  private async fakePasswordCheck(password: string): Promise<boolean> {
    /*
     * This intentionally performs bcrypt work when the email does not
     * exist, reducing the timing difference between existing/non-existing
     * accounts.
     */
    return bcrypt.compare(password, DUMMY_PASSWORD_HASH);
  }

  // ---------------------------------------------------------------------------
  // SESSION REVOCATION
  // ---------------------------------------------------------------------------

  private async revokeRefreshSession(userId: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: {
        refreshToken: null,
        refreshTokenId: null,
        tokenVersion: {
          increment: 1,
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isUserEmailUniqueViolation(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    if (error.code !== 'P2002') {
      return false;
    }

    const target = error.meta?.target;

    return Array.isArray(target) && target.includes('email');
  }

  private toAuthUserDto(
    user: AuthUserData | LoginUserData | RefreshUserData,
  ): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  private hashRefreshToken(refreshId: string): string {
    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    return createHmac('sha256', refreshSecret).update(refreshId).digest('hex');
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

  private fireAndForget(promise: Promise<unknown>, operation: string): void {
    void promise.catch((error) => {
      this.logger.warn(`Failed to execute ${operation}`, error);
    });
  }
}
