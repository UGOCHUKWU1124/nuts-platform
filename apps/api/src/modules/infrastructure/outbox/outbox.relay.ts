import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import {
  getErrorCode,
  getErrorMessage,
} from 'src/modules/shared/utils/error-details.util';

@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);
  private isProcessing = false;
  private warnedMissingTable = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  /**
   * Polls the outbox_events table every 10 seconds for PENDING events when RabbitMQ is online.
   * Atomically claims batches and relays them to RabbitMQ.
   */
  @Interval(10000)
  async processOutboxEvents(): Promise<void> {
    if (this.isProcessing) return;
    if (!this.rabbitmq.isAvailable()) return;
    this.isProcessing = true;

    try {
      const pendingEvents = await this.prisma.outboxEvent.findMany({
        where: {
          status: {
            in: [OutboxStatus.PENDING, OutboxStatus.FAILED],
          },
          attempts: {
            lt: 5,
          },
        },
        select: {
          id: true,
          eventType: true,
          payload: true,
          attempts: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 50,
      });

      if (pendingEvents.length === 0) return;

      for (const event of pendingEvents) {
        // Mark as processing
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: OutboxStatus.PROCESSING },
        });

        const success = await this.rabbitmq.publish(
          event.eventType,
          event.payload,
        );

        if (success) {
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: OutboxStatus.PUBLISHED,
              processedAt: new Date(),
            },
          });
        } else {
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: OutboxStatus.FAILED,
              attempts: { increment: 1 },
              lastError: 'RabbitMQ publish failed or disconnected',
            },
          });
        }
      }
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);
      if (
        getErrorCode(err) === 'P2021' ||
        (errorMessage.includes('outbox_events') &&
          errorMessage.includes('does not exist'))
      ) {
        if (!this.warnedMissingTable) {
          this.logger.warn(
            'Table public.outbox_events does not exist yet. Relay is idling until migrations or prisma db push are executed.',
          );
          this.warnedMissingTable = true;
        }
        return;
      }
      this.logger.error(`Error in outbox relay execution: ${errorMessage}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
