import {
  BadRequestException,
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
import type { AuthTokens } from '@api/modules/auth/types/auth.types';
import { LoginDto } from '@api/modules/auth/dto/login.dto';
import { PrismaService } from '@api/modules/infrastructure/prisma/prisma.service';
import { AccountLockService } from '@api/modules/security/services/account-lock.service';
import { AuditLogService } from '@api/modules/shared/audit-log/audit-log.service';
import {
  BCRYPT_COST_FACTOR,
  UNKNOWN_ACCOUNT_PASSWORD_HASH,
} from '@api/modules/shared/constants/bcrypt.constants';
import { AdminAuthUserDto } from './dto/admin-auth-user.dto';
import { AdminRegisterDto } from './dto/admin-register.dto';

/** Fields needed to issue a session — no password, no hashed tokens. */
const ADMIN_SESSION_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  tokenVersion: true,
} as const;

/** Fields needed to verify credentials at login time. */
const ADMIN_LOGIN_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  password: true,
  isActive: true,
  tokenVersion: true,
} as const;

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditLog: AuditLogService,
    private readonly accountLockService: AccountLockService,
  ) {}

  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ user: AdminAuthUserDto; tokens: AuthTokens }> {
    const identifier = `email:${dto.email.toLowerCase().trim()}`;

    // Only select the fields we actually need — avoids transferring hashed
    // refresh tokens and other columns that serve no purpose here.
    const admin = await this.prisma.admin.findUnique({
      where: { email: dto.email },
      select: ADMIN_LOGIN_SELECT,
    });

    const passwordMatches = await bcrypt.compare(
      dto.password,
      admin?.password ?? UNKNOWN_ACCOUNT_PASSWORD_HASH,
    );

    if (!admin || !passwordMatches) {
      this.logger.warn('Failed admin login attempt');
      await this.accountLockService
        .recordFailedAttempt(identifier)
        .catch(() => {});
      await this.auditLog
        .log({
          action: 'ADMIN_LOGIN_FAILED',
          entity: 'Admin',
          entityId: admin?.id,
          payload: { credentialType: 'email' },
          ipAddress,
          userAgent,
        })
        .catch(() => {});
      throw new UnauthorizedException('Invalid admin credentials');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account is deactivated');
    }

    void this.accountLockService.resetAttempts(identifier).catch(() => {});

    // Upgrade weak legacy hashes after successful login. Never lower a hash's
    // work factor: doing so would silently make an already stronger hash weaker.
    if (bcrypt.getRounds(admin.password) < BCRYPT_COST_FACTOR) {
      bcrypt
        .hash(dto.password, BCRYPT_COST_FACTOR)
        .then((upgradedHash) =>
          this.prisma.admin.update({
            where: { id: admin.id },
            data: { password: upgradedHash },
          }),
        )
        .catch((err) => {
          this.logger.warn('Failed to upgrade admin password hash cost', err);
        });
    }

    const session = await this.issueSession(admin);

    // Fire-and-forget audit log so it does not block the login response
    this.auditLog
      .log({
        action: 'ADMIN_LOGIN',
        entity: 'Admin',
        entityId: admin.id,
        adminId: admin.id,
        payload: { role: 'ADMIN' },
        ipAddress,
        userAgent,
      })
      .catch((err) => {
        this.logger.error('Failed to write admin login audit log', err);
      });

    return session;
  }

  async setup(
    dto: AdminRegisterDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ user: AdminAuthUserDto; tokens: AuthTokens }> {
    const setupSecret = this.configService.get<string>('ADMIN_SETUP_SECRET');
    if (!setupSecret) {
      throw new BadRequestException('Admin setup is not configured');
    }

    const providedSecret = dto.setupSecret || dto.secret;
    const providedSecretBuffer = Buffer.from(providedSecret ?? '', 'utf8');
    const expectedSecretBuffer = Buffer.from(setupSecret, 'utf8');
    if (
      providedSecretBuffer.length !== expectedSecretBuffer.length ||
      !timingSafeEqual(providedSecretBuffer, expectedSecretBuffer)
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const normalizedEmail = dto.email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_COST_FACTOR);

    let admin;
    try {
      admin = await this.prisma.$transaction(
        async (tx) => {
          const existingAdmins = await tx.admin.count();
          if (existingAdmins > 0) {
            throw new ConflictException(
              'Admin setup has already been completed',
            );
          }

          return tx.admin.create({
            data: {
              email: normalizedEmail,
              password: hashedPassword,
              role: ROLE.ADMIN,
              firstName: dto.firstName ?? null,
              lastName: dto.lastName ?? null,
            },
            select: ADMIN_SESSION_SELECT,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Admin setup is already in progress or has been completed',
        );
      }
      throw error;
    }

    this.logger.log('Initial admin account created');

    await this.auditLog.log({
      action: 'ADMIN_SETUP',
      entity: 'Admin',
      entityId: admin.id,
      adminId: admin.id,
      payload: {
        role: 'ADMIN',
      },
      ipAddress,
      userAgent,
    });

    return this.issueSession(admin);
  }

  async refresh(
    adminId: string,
    refreshId?: string,
  ): Promise<{ user: AdminAuthUserDto; tokens: AuthTokens }> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: {
        ...ADMIN_SESSION_SELECT,
        refreshToken: true,
        refreshTokenId: true,
      },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account is deactivated');
    }

    if (!refreshId || !admin.refreshToken || !admin.refreshTokenId) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    if (admin.refreshTokenId !== refreshId) {
      throw new UnauthorizedException(
        'Refresh session has already been rotated',
      );
    }

    const valid = await this.verifyRefreshTokenHash(
      refreshId,
      admin.refreshToken,
    );
    if (!valid) {
      await this.prisma.admin.updateMany({
        where: { id: admin.id },
        data: {
          refreshToken: null,
          refreshTokenId: null,
          tokenVersion: { increment: 1 },
        },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueSession(admin, refreshId);
  }

  /**
   * Returns the current admin's profile for session rehydration
   * (GET /admin/auth/me). Rejects missing or deactivated accounts so
   * stale sessions are invalidated immediately.
   */
  async me(adminId: string): Promise<AdminAuthUserDto> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: ADMIN_SESSION_SELECT,
    });

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account is deactivated');
    }

    return this.toAuthUserDto(admin);
  }

  async updateProfile(
    adminId: string,
    dto: { firstName?: string; lastName?: string },
  ): Promise<AdminAuthUserDto> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { id: true, isActive: true },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account is deactivated');
    }

    const updated = await this.prisma.admin.update({
      where: { id: adminId },
      data: {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName.trim() }
          : {}),
      },
      select: ADMIN_SESSION_SELECT,
    });

    return this.toAuthUserDto(updated);
  }

  async logout(
    adminId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    try {
      await this.prisma.admin.update({
        where: { id: adminId },
        data: {
          refreshToken: null,
          refreshTokenId: null,
          tokenVersion: { increment: 1 },
        },
      });
    } catch {
      // If admin not found or already deleted, don't crash
    }

    await this.auditLog
      .log({
        action: 'ADMIN_LOGOUT',
        entity: 'Admin',
        entityId: adminId,
        adminId,
        ipAddress,
        userAgent,
      })
      .catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private async issueSession(
    admin: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      tokenVersion: number;
    },
    expectedRefreshId?: string,
  ): Promise<{ user: AdminAuthUserDto; tokens: AuthTokens }> {
    const user = this.toAuthUserDto(admin);
    const tokens = await this.generateTokens(
      admin.id,
      admin.email,
      admin.tokenVersion,
    );

    await this.storeRefreshToken(admin.id, tokens.refreshId, expectedRefreshId);

    return { user, tokens };
  }

  private toAuthUserDto(admin: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }): AdminAuthUserDto {
    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
    };
  }

  private async generateTokens(
    userId: string,
    email: string,
    tokenVersion: number,
  ): Promise<AuthTokens> {
    const refreshId = randomBytes(16).toString('hex');

    const issuer = this.configService.getOrThrow<string>('JWT_ISSUER');
    const accessAudience = this.configService.getOrThrow<string>(
      'JWT_ACCESS_AUDIENCE',
    );
    const refreshAudience = this.configService.getOrThrow<string>(
      'JWT_REFRESH_AUDIENCE',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role: ROLE.ADMIN, tokenVersion },
        {
          secret: this.configService.getOrThrow<string>('JWT_SECRET'),
          expiresIn: this.configService.getOrThrow<string>(
            'JWT_ACCESS_EXPIRES_IN',
          ) as StringValue,
          issuer,
          audience: accessAudience,
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email, role: ROLE.ADMIN, refreshId },
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.getOrThrow<string>(
            'JWT_REFRESH_EXPIRES_IN',
          ) as StringValue,
          issuer,
          audience: refreshAudience,
        },
      ),
    ]);

    return { accessToken, refreshToken, refreshId };
  }

  /**
   * Stores a bcrypt hash of the refreshId (NOT the full JWT string).
   *
   * Why: The full JWT is >200 chars.  bcrypt silently truncates inputs at
   * 72 bytes, meaning two different tokens that share the same first 72
   * characters would both pass verification — a real security hole.
   * The refreshId is a 32-char hex string that fits well within the limit
   * and is the true secret identifier embedded in the token.
   */
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

  private async storeRefreshToken(
    adminId: string,
    refreshId: string,
    expectedRefreshId?: string,
  ): Promise<void> {
    const hashed = this.hashRefreshToken(refreshId);

    if (expectedRefreshId) {
      const result = await this.prisma.admin.updateMany({
        where: {
          id: adminId,
          refreshTokenId: expectedRefreshId,
          isActive: true,
        },
        data: { refreshToken: hashed, refreshTokenId: refreshId },
      });
      if (result.count !== 1) {
        throw new UnauthorizedException(
          'Refresh session has already been rotated',
        );
      }
      return;
    }

    await this.prisma.admin.update({
      where: { id: adminId },
      data: { refreshToken: hashed, refreshTokenId: refreshId },
    });
  }
}
