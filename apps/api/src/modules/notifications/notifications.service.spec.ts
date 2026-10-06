import { NotFoundException } from '@nestjs/common';
import { NotificationType, ROLE } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    notification: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
    };
    service = new NotificationsService(prisma as never);
  });

  it('filters notification lists by order category and current role', async () => {
    await service.list('vendor-1', ROLE.VENDOR, { category: 'orders' });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'vendor-1',
          role: ROLE.VENDOR,
          type: {
            in: [
              NotificationType.ORDER_PLACED,
              NotificationType.ORDER_CONFIRMED,
              NotificationType.ORDER_SHIPPED,
              NotificationType.ORDER_DELIVERED,
              NotificationType.ORDER_CANCELLED,
            ],
          },
        },
      }),
    );
  });

  it('filters payment notifications and unread notifications together', async () => {
    await service.list('user-1', ROLE.USER, {
      unreadOnly: true,
      category: 'payments',
    });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          role: ROLE.USER,
          isRead: false,
          type: {
            in: [
              NotificationType.PAYMENT_RECEIVED,
              NotificationType.PAYOUT_PROCESSED,
            ],
          },
        },
      }),
    );
  });

  it('returns detail only for a notification owned by the active role and user', async () => {
    const createdAt = new Date('2026-10-06T00:00:00.000Z');
    prisma.notification.findFirst.mockResolvedValue({
      id: 'notification-1',
      userId: 'user-1',
      role: ROLE.USER,
      link: '/account/orders',
      createdAt,
    });

    await expect(
      service.getById('notification-1', 'user-1', ROLE.USER),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'notification-1',
        actionUrl: '/account/orders',
      }),
    );
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: 'notification-1', userId: 'user-1', role: ROLE.USER },
    });
  });

  it('does not expose another user or role notification', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);

    await expect(
      service.getById('notification-1', 'user-1', ROLE.ADMIN),
    ).rejects.toThrow(NotFoundException);
  });
});
