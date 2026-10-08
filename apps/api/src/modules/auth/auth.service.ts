import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, ROLE } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { EmailService } from '@api/modules/infrastructure/mail/email.service';
import { PrismaService } from '@api/modules/infrastructure/prisma/prisma.service';
import { ReferralService } from '@api/modules/referral/referral.service';
import { AccountLockService } from '@api/modules/security/services/account-lock.service';
import { AuditLogService } from '@api/modules/shared/audit-log/audit-log.service';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { OtpService } from './otp/otp.service';
import {
  BCRYPT_COST_FACTOR,
  UNKNOWN_ACCOUNT_PASSWORD_HASH,
} from '@api/modules/shared/constants/bcrypt.constants';
import { USER_AUTH_SELECT, USER_LOGIN_SELECT } from './auth.selects';
import type { AuthSession } from './types/auth.types';
import { RefreshSessionService } from './sessions/refresh-session.service';
import type { RefreshJwtPayload } from './types/refresh-jwt-payload.type';
import type { AuthenticatedUser } from './types/authenticated-user.type';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly emailService: EmailService,
    private readonly auditLog: AuditLogService,
    private readonly referralService: ReferralService,
    private readonly accountLockService: AccountLockService,
    private readonly refreshSessionService: RefreshSessionService,
  ) {}

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

    const password = await bcrypt.hash(dto.password, BCRYPT_COST_FACTOR);

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
      const session = await this.refreshSessionService.issueUserSession(user);

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

    // Always perform a password-hash comparison so account existence cannot
    // be inferred from a measurable response-time difference.
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.password ?? UNKNOWN_ACCOUNT_PASSWORD_HASH,
    );

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

    if (bcrypt.getRounds(user.password) < BCRYPT_COST_FACTOR) {
      void this.upgradePasswordHash(user.id, user.password, dto.password);
    }

    const session = await this.refreshSessionService.issueUserSession(user);

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
    return this.refreshSessionService.refresh(payload);
  }

  // ---------------------------------------------------------------------------
  // LOGOUT
  // ---------------------------------------------------------------------------

  async logout(
    userId: string,
    role: ROLE = ROLE.USER,
    sessionId?: string,
    refreshToken?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    if (role === ROLE.USER) {
      if (sessionId) {
        await this.refreshSessionService.revokeUserSession(userId, sessionId);
      } else if (refreshToken) {
        await this.refreshSessionService.revokeUserSessionByRefreshToken(
          userId,
          refreshToken,
        );
      }
    } else {
      await this.refreshSessionService.revokeSession(userId, role, true);
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

    const password = await bcrypt.hash(dto.newPassword, BCRYPT_COST_FACTOR);

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
  // PASSWORD HASH
  // ---------------------------------------------------------------------------

  private async upgradePasswordHash(
    userId: string,
    oldHash: string,
    password: string,
  ): Promise<void> {
    try {
      const newHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);

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

  async getProfile(user: AuthenticatedUser) {
    if (user.role === ROLE.VENDOR) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          storeName: true,
          storeSlug: true,
          storeDescription: true,
          storeLogoUrl: true,
          isVerified: true,
          isActive: true,
          isApproved: true,
        },
      });
      if (!vendor) throw new UnauthorizedException('Vendor profile not found');
      return {
        ...vendor,
        role: 'vendor' as const,
        capabilities: {
          canPurchase: false,
          canSell: Boolean(vendor.isApproved && vendor.isActive),
          canAdminister: false,
        },
      };
    }

    if (user.role === ROLE.ADMIN) {
      const admin = await this.prisma.admin.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
        },
      });
      if (!admin) throw new UnauthorizedException('Admin profile not found');
      return {
        ...admin,
        role: 'admin' as const,
        capabilities: {
          canPurchase: false,
          canSell: false,
          canAdminister: Boolean(admin.isActive),
        },
      };
    }

    const customer = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
      },
    });
    if (!customer) throw new UnauthorizedException('User profile not found');
    return {
      ...customer,
      role: 'user' as const,
      capabilities: {
        canPurchase: Boolean(customer.isActive),
        canSell: false,
        canAdminister: false,
      },
    };
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

  private fireAndForget(promise: Promise<unknown>, operation: string): void {
    void promise.catch((error) => {
      this.logger.warn(`Failed to execute ${operation}`, error);
    });
  }
}
