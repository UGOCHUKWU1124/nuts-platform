import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NotificationPriority,
  NotificationType,
  Prisma,
  ROLE,
} from '@prisma/client';
import { filter, map, Observable, Subject } from 'rxjs';
import {
  buildCursorMeta,
  buildCursorWhere,
  getCursorPagination,
  type CursorPaginationMetaDto,
} from 'src/modules/shared/utils/cursor-pagination.util';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

export interface CreateNotificationDto {
  userId: string;
  role?: ROLE;
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  link?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationSseEvent {
  userId: string;
  notification: Prisma.NotificationGetPayload<Record<string, never>>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly sseSubject = new Subject<NotificationSseEvent>();

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        role: dto.role ?? ROLE.USER,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        priority: dto.priority ?? NotificationPriority.MEDIUM,
        link: dto.link,
        metadata: dto.metadata as Prisma.InputJsonValue,
      },
    });

    // Broadcast through SSE stream
    this.sseSubject.next({
      userId: dto.userId,
      notification,
    });

    return notification;
  }

  async list(
    userId: string,
    role: ROLE = ROLE.USER,
    params: {
      cursor?: string;
      limit?: number;
      unreadOnly?: boolean;
      type?: NotificationType;
    } = {},
  ): Promise<{
    data: (Prisma.NotificationGetPayload<Record<string, never>> & {
      actionUrl: string | null;
    })[];
    meta: CursorPaginationMetaDto;
  }> {
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const { take, decodedCursor } = getCursorPagination(limit, params.cursor);

    const where: Prisma.NotificationWhereInput = {
      userId,
      role,
      ...(params.unreadOnly ? { isRead: false } : {}),
      ...(params.type ? { type: params.type } : {}),
    };

    const cursorId = decodedCursor?.id;
    const cursorCreatedAt = decodedCursor?.createdAt;
    const cursorDate =
      cursorCreatedAt instanceof Date
        ? cursorCreatedAt
        : typeof cursorCreatedAt === 'string'
          ? new Date(cursorCreatedAt)
          : null;

    if (
      typeof cursorId === 'string' &&
      cursorDate &&
      !Number.isNaN(cursorDate.getTime())
    ) {
      const cursorWhere = buildCursorWhere(
        {
          createdAt: cursorDate,
          id: cursorId,
        },
        'desc',
      );
      where.OR = cursorWhere;
    }

    const fetched = await this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });

    const meta = buildCursorMeta(fetched, limit, (item) => ({
      createdAt: item.createdAt.toISOString(),
      id: item.id,
    }));

    const data = fetched.slice(0, limit).map((item) => ({
      ...item,
      actionUrl: item.link ?? null,
    }));

    return {
      data,
      meta,
    };
  }

  async getUnreadCount(
    userId: string,
    role: ROLE = ROLE.USER,
  ): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        role,
        isRead: false,
      },
    });
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: string, role: ROLE = ROLE.USER) {
    return this.prisma.notification.updateMany({
      where: {
        userId,
        role,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async delete(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.delete({
      where: { id },
    });
  }

  async clearAll(userId: string, role: ROLE = ROLE.USER) {
    return this.prisma.notification.deleteMany({
      where: {
        userId,
        role,
        isRead: true,
      },
    });
  }

  /**
   * SSE Stream: Emits live notifications for the given userId
   */
  subscribeToUserStream(userId: string): Observable<MessageEvent> {
    return this.sseSubject.asObservable().pipe(
      filter((event) => event.userId === userId),
      map(
        (event) =>
          ({
            data: event.notification,
          }) as MessageEvent,
      ),
    );
  }
}
