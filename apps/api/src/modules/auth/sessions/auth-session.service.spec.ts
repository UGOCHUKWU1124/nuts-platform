import { UnauthorizedException } from '@nestjs/common';
import { ROLE } from '@prisma/client';
import { AuthSessionService } from './auth-session.service';

describe('AuthSessionService', () => {
  const payload = {
    sub: 'user-1',
    role: ROLE.USER,
    tokenVersion: 4,
    sessionId: 'device-session-1',
  };
  let service: AuthSessionService;
  let prisma: {
    user: { findUnique: jest.Mock };
    userAuthSession: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: payload.sub,
          email: 'user@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: ROLE.USER,
          isActive: true,
          tokenVersion: payload.tokenVersion,
        }),
      },
      userAuthSession: {
        findFirst: jest.fn().mockResolvedValue({ id: payload.sessionId }),
      },
    };
    service = new AuthSessionService(prisma as never);
  });

  it('attaches the active device session to the authenticated user', async () => {
    await expect(service.validateAccessToken(payload)).resolves.toEqual({
      id: payload.sub,
      email: 'user@example.com',
      role: ROLE.USER,
      firstName: 'Test',
      lastName: 'User',
      sessionId: payload.sessionId,
    });
    expect(prisma.userAuthSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: payload.sessionId,
        userId: payload.sub,
        tokenVersion: payload.tokenVersion,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      select: { id: true },
    });
  });

  it('rejects access tokens whose device session has been revoked', async () => {
    prisma.userAuthSession.findFirst.mockResolvedValue(null);

    await expect(service.validateAccessToken(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
