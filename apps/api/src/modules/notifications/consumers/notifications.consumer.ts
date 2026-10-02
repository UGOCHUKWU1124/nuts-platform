import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationPriority, NotificationType, ROLE } from '@prisma/client';
import {
  getErrorMessage,
  getErrorStack,
} from '../../shared/utils/error-details.util';
import { RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { NotificationsService } from '../notifications.service';

interface NotificationMessage {
  userId: string;
  type: NotificationType;
  priority: NotificationPriority;
  role: ROLE;
  title?: string;
  message?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseNotificationMessage(value: unknown): NotificationMessage | null {
  if (!isRecord(value) || typeof value.userId !== 'string' || !value.userId) {
    return null;
  }

  return {
    userId: value.userId,
    type: Object.values(NotificationType).includes(
      value.type as NotificationType,
    )
      ? (value.type as NotificationType)
      : NotificationType.SYSTEM_ANNOUNCEMENT,
    priority: Object.values(NotificationPriority).includes(
      value.priority as NotificationPriority,
    )
      ? (value.priority as NotificationPriority)
      : NotificationPriority.MEDIUM,
    role: Object.values(ROLE).includes(value.role as ROLE)
      ? (value.role as ROLE)
      : ROLE.USER,
    title: typeof value.title === 'string' ? value.title : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
    link: typeof value.link === 'string' ? value.link : undefined,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

@Injectable()
export class NotificationsConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotificationsConsumer.name);

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    await this.rabbitmq.consume<unknown>(
      RABBITMQ_QUEUES.NOTIFICATIONS,
      async (rawPayload: unknown) => {
        try {
          const payload = parseNotificationMessage(rawPayload);
          if (!payload) return;

          await this.notificationsService.create({
            userId: payload.userId,
            role: payload.role,
            type: payload.type,
            title: payload.title || 'New Notification',
            message: payload.message || '',
            priority: payload.priority,
            link: payload.link,
            metadata: payload.metadata,
          });
        } catch (err: unknown) {
          this.logger.error(
            `Failed to handle notification message: ${getErrorMessage(err)}`,
            getErrorStack(err),
          );
          throw err;
        }
      },
    );
  }
}
