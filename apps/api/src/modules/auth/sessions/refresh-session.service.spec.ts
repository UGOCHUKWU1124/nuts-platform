import { UnauthorizedException } from '@nestjs/common';
import { ROLE } from '@prisma/client';
import { createHmac } from 'crypto';
import { RefreshSessionService } from './refresh-session.service';

describe('RefreshSessionService user sessions', () => {
  const refreshSecret = 'test-refresh-secret';
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: ROLE.USER,
    tokenVersion: 2,
  };

  let service: RefreshSessionService;
  let prisma: {
    $transaction: jest.Mock;
    user: { findUnique: jest.Mock; updateMany: jest.Mock };
    userAuthSession: {
      create: jest.Mock;
      deleteMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwtService: {
    decode: jest.Mock;
    signAsync: jest.Mock;
    verifyAsync: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((callback: (tx: typeof prisma) => unknown) =>
        callback(prisma),
      ),
      user: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      userAuthSession: {
        create: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue({
          refreshTokenId: 'device-refresh-id',
        }),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwtService = {
      decode: jest
        .fn()
        .mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      verifyAsync: jest.fn(),
    };
    const config = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_ISSUER: 'nuts-test',
          JWT_ACCESS_AUDIENCE: 'nuts-api',
          JWT_REFRESH_AUDIENCE: 'nuts-refresh',
          JWT_SECRET: 'test-access-secret',
          JWT_REFRESH_SECRET: refreshSecret,
          JWT_ACCESS_EXPIRES_IN: '15m',
          JWT_REFRESH_EXPIRES_IN: '7d',
        };
        return values[key];
      }),
    };

    service = new RefreshSessionService(
      prisma as never,
      jwtService as never,
      config as never,
    );
  });

  it('creates independent refresh sessions for separate logins on the same account', async () => {
    const first = await service.issueUserSession(user);
    const second = await service.issueUserSession(user);

    expect(first.tokens.sessionId).toBeDefined();
    expect(second.tokens.sessionId).toBeDefined();
    expect(first.tokens.sessionId).not.toBe(second.tokens.sessionId);
    expect(prisma.userAuthSession.create).toHaveBeenCalledTimes(2);
    expect(prisma.userAuthSession.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          userId: user.id,
          tokenVersion: user.tokenVersion,
          refreshTokenId: first.tokens.refreshId,
        }),
      }),
    );
  });

  it('rotates only the refresh session identified by the presented device token', async () => {
    const refreshId = 'current-refresh-id';
    const sessionId = 'device-session-1';
    const storedHash = createHmac('sha256', refreshSecret)
      .update(refreshId)
      .digest('hex');
    prisma.user.findUnique.mockResolvedValue({ ...user, isActive: true });
    prisma.userAuthSession.findUnique.mockResolvedValue({
      id: sessionId,
      userId: user.id,
      tokenVersion: user.tokenVersion,
      refreshToken: storedHash,
      refreshTokenId: refreshId,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });

    const result = await service.refresh({
      sub: user.id,
      role: ROLE.USER,
      refreshId,
      sessionId,
    });

    expect(result.tokens.sessionId).toBe(sessionId);
    expect(prisma.userAuthSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: sessionId,
          userId: user.id,
          refreshTokenId: refreshId,
        }),
        data: expect.objectContaining({
          refreshTokenId: expect.any(String),
        }),
      }),
    );
  });

  it('revokes only the requested device session on logout', async () => {
    await service.revokeUserSession(user.id, 'device-session-2');

    expect(prisma.userAuthSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'device-session-2',
        userId: user.id,
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
        refreshToken: null,
        refreshTokenId: null,
      },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: user.id, refreshTokenId: 'device-refresh-id' },
      data: { refreshToken: null, refreshTokenId: null },
    });
  });

  it('uses a verified legacy refresh cookie to revoke its migrated device session', async () => {
    prisma.userAuthSession.findUnique.mockResolvedValue({
      id: 'migrated-session',
      userId: user.id,
    });
    jwtService.verifyAsync.mockResolvedValue({
      sub: user.id,
      role: ROLE.USER,
      refreshId: 'legacy-refresh-id',
    });

    await service.revokeUserSessionByRefreshToken(
      user.id,
      'signed-legacy-refresh-token',
    );

    expect(jwtService.verifyAsync).toHaveBeenCalledWith(
      'signed-legacy-refresh-token',
      expect.objectContaining({
        audience: 'nuts-refresh',
        ignoreExpiration: true,
        issuer: 'nuts-test',
        secret: refreshSecret,
      }),
    );
    expect(prisma.userAuthSession.findUnique).toHaveBeenCalledWith({
      where: { refreshTokenId: 'legacy-refresh-id' },
    });
    expect(prisma.userAuthSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'migrated-session',
          userId: user.id,
          revokedAt: null,
        },
      }),
    );
  });

  it('does not refresh a session whose account-wide token version changed', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      isActive: true,
      tokenVersion: user.tokenVersion + 1,
    });
    prisma.userAuthSession.findUnique.mockResolvedValue({
      id: 'device-session-1',
      userId: user.id,
      tokenVersion: user.tokenVersion,
      refreshToken: 'stored-hash',
      refreshTokenId: 'refresh-id',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });

    await expect(
      service.refresh({
        sub: user.id,
        role: ROLE.USER,
        refreshId: 'refresh-id',
        sessionId: 'device-session-1',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.userAuthSession.updateMany).not.toHaveBeenCalled();
  });
});
