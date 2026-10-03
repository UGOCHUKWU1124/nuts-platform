import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RABBITMQ_QUEUES } from './rabbitmq.constants';
import { RabbitMQService } from './rabbitmq.service';
import {
  getErrorMessage,
  getErrorStack,
} from '../../shared/utils/error-details.util';

export interface AnalyticsQueuePayload {
  type: 'product_view' | 'search';
  productId?: string;
  userId?: string | null;
  sessionId?: string | null;
  query?: string;
  resultsCount?: number;
  timestamp?: string | number | Date;
}

@Injectable()
export class AnalyticsConsumer implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsConsumer.name);

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.rabbitmq.consume<AnalyticsQueuePayload>(
      RABBITMQ_QUEUES.ANALYTICS,
      async (payload) => {
        try {
          if (!payload) return;

          const createdAt = payload.timestamp
            ? new Date(payload.timestamp)
            : new Date();

          if (payload.type === 'product_view' && payload.productId) {
            await this.prisma.productView.create({
              data: {
                productId: payload.productId,
                userId: payload.userId ?? null,
                sessionId: payload.sessionId ?? null,
                createdAt,
              },
            });
          } else if (payload.type === 'search' && payload.query) {
            await this.prisma.searchQuery.create({
              data: {
                query: payload.query,
                resultsCount: payload.resultsCount ?? 0,
                userId: payload.userId ?? null,
                sessionId: payload.sessionId ?? null,
                createdAt,
              },
            });
          }
        } catch (err: unknown) {
          this.logger.error(
            `Failed to process analytics event: ${getErrorMessage(err)}`,
            getErrorStack(err),
          );
        }
      },
    );
  }
}
