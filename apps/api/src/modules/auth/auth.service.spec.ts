import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, ROLE } from '@prisma/client';
import { EmailService } from '@api/modules/infrastructure/mail/email.service';
import { PrismaService } from '@api/modules/infrastructure/prisma/prisma.service';
import { ReferralService } from '@api/modules/referral/referral.service';
import { AccountLockService } from '@api/modules/security/services/account-lock.service';
import { AuditLogService } from '@api/modules/shared/audit-log/audit-log.service';
import { AuthService } from './auth.service';
import { OtpService } from './otp/otp.service';
import { RefreshSessionService } from './sessions/refresh-session.service';

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockOtpService: any;
  let mockEmailService: any;
  let mockAuditLog: any;
  let mockReferralService: any;
  let mockAccountLockService: any;
  let mockRefreshSessionService: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      userWallet: {
        create: jest.fn(),
      },
      shippingAddress: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: any) => Promise<unknown>) =>
        callback(mockPrisma),
      ),
    };

    mockOtpService = {
      verifyOtp: jest.fn().mockResolvedValue(true),
    };

    mockEmailService = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    };

    mockAuditLog = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockReferralService = {
      validateReferralCode: jest.fn(),
      createReferralCode: jest.fn().mockResolvedValue({ id: 'ref-code-1' }),
      applyReferralAtSignupById: jest.fn().mockResolvedValue(undefined),
    };

    mockAccountLockService = {
      recordFailedAttempt: jest.fn().mockResolvedValue(1),
      resetAttempts: jest.fn().mockResolvedValue(undefined),
    };

    mockRefreshSessionService = {
      revokeSession: jest.fn().mockResolvedValue(undefined),
      revokeUserSession: jest.fn().mockResolvedValue(undefined),
      revokeUserSessionByRefreshToken: jest.fn().mockResolvedValue(undefined),
      issueUserSession: jest.fn().mockResolvedValue({
        tokens: {
          accessToken: 'access-jwt-token',
          refreshToken: 'refresh-jwt-token',
          refreshId: 'ref-1',
        },
        user: { id: 'u-1', email: 'test@example.com' },
      }),
    };

    service = new AuthService(
      mockPrisma,
      mockOtpService,
      mockEmailService,
      mockAuditLog,
      mockReferralService,
      mockAccountLockService,
      mockRefreshSessionService,
    );
  });

  describe('register', () => {
    const registerDto = {
      email: 'Test@Example.COM ',
      password: 'StrongPassword123!',
      firstName: 'John',
      lastName: 'Doe',
      otpCode: '123456',
    };

    it('creates user, wallet, and referral code in a single atomic transaction', async () => {
      const createdUser = {
        id: 'u-1',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'USER',
        isActive: true,
      };

      mockPrisma.user.create.mockResolvedValue(createdUser);

      const session = await service.register(registerDto);

      expect(mockOtpService.verifyOtp).toHaveBeenCalledWith(
        'test@example.com',
        '123456',
        'registration',
      );
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
          }),
        }),
      );
      expect(mockPrisma.userWallet.create).toHaveBeenCalledWith({
        data: { userId: 'u-1' },
      });
      expect(mockReferralService.createReferralCode).toHaveBeenCalledWith(
        mockPrisma,
        'u-1',
      );
      expect(session.tokens.accessToken).toBe('access-jwt-token');
    });

    it('throws ConflictException on unique email constraint violation (P2002)', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on email',
        { code: 'P2002', clientVersion: '7.8.0', meta: { target: ['email'] } },
      );

      mockPrisma.user.create.mockRejectedValue(p2002Error);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('authenticates user with valid credentials and resets failed attempts', async () => {
      const hashedPassword = await bcrypt.hash('StrongPassword123!', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'test@example.com',
        password: hashedPassword,
        isActive: true,
        role: 'USER',
      });

      const session = await service.login({
        email: 'test@example.com',
        password: 'StrongPassword123!',
      });

      expect(session).toBeDefined();
      expect(mockAccountLockService.resetAttempts).toHaveBeenCalledWith(
        'email:test@example.com',
      );
      expect(mockRefreshSessionService.issueUserSession).toHaveBeenCalled();
    });

    it('performs timing-safe hash comparison and records failed attempt on invalid password', async () => {
      const hashedPassword = await bcrypt.hash('DifferentPassword', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'test@example.com',
        password: hashedPassword,
        isActive: true,
        role: 'USER',
      });

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockAccountLockService.recordFailedAttempt).toHaveBeenCalledWith(
        'email:test@example.com',
      );
    });

    it('throws UnauthorizedException and protects against user enumeration when account does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'nonexistent@example.com',
          password: 'AnyPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockAccountLockService.recordFailedAttempt).toHaveBeenCalledWith(
        'email:nonexistent@example.com',
      );
    });

    it('throws UnauthorizedException when account is deactivated', async () => {
      const hashedPassword = await bcrypt.hash('StrongPassword123!', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'test@example.com',
        password: hashedPassword,
        isActive: false, // Deactivated
        role: 'USER',
      });

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'StrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes only the current user device session', async () => {
      await service.logout('u-1', ROLE.USER, 'device-session-1');

      expect(mockRefreshSessionService.revokeUserSession).toHaveBeenCalledWith(
        'u-1',
        'device-session-1',
      );
      expect(mockRefreshSessionService.revokeSession).not.toHaveBeenCalled();
    });

    it('uses the verified legacy refresh cookie to revoke its migrated device session', async () => {
      await service.logout(
        'u-1',
        ROLE.USER,
        undefined,
        'signed-refresh-cookie',
      );

      expect(
        mockRefreshSessionService.revokeUserSessionByRefreshToken,
      ).toHaveBeenCalledWith('u-1', 'signed-refresh-cookie');
      expect(mockRefreshSessionService.revokeSession).not.toHaveBeenCalled();
    });

    it('retains account-wide revocation for the separate admin and vendor flows', async () => {
      await service.logout('admin-1', ROLE.ADMIN, undefined);

      expect(mockRefreshSessionService.revokeSession).toHaveBeenCalledWith(
        'admin-1',
        ROLE.ADMIN,
        true,
      );
      expect(
        mockRefreshSessionService.revokeUserSession,
      ).not.toHaveBeenCalled();
    });
  });
});
