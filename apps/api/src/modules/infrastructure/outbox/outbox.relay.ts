import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import {
  getErrorCode,
  getErrorMessage,
} from '@api/modules/shared/utils/error-details.util';

@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);
  private isProcessing = false;
  private warnedMissingTable = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  private hasPendingEvents = true;
  private lastCheckedAt = 0;
  private readonly IDLE_POLL_INTERVAL_MS = 60_000;

  /**
   * Signals the relay that a new outbox event has been persisted.
   * Wakes up the relay immediately without waiting for the interval ticker.
   */
  public notifyNewEvent(): void {
    this.hasPendingEvents = true;
    void this.processOutboxEvents();
  }

  /**
   * Polls the outbox_events table for PENDING events when RabbitMQ is online.
   * Uses adaptive backoff when idle and batches all updates into atomic operations.
   */
  @Interval(10000)
  async processOutboxEvents(): Promise<void> {
    if (this.isProcessing) return;
    if (!this.rabbitmq.isAvailable()) return;

    const now = Date.now();
    // If the outbox is known to be empty, avoid hammering the remote database every 10s
    if (
      !this.hasPendingEvents &&
      now - this.lastCheckedAt < this.IDLE_POLL_INTERVAL_MS
    ) {
      return;
    }
    this.lastCheckedAt = now;
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

      if (pendingEvents.length === 0) {
        this.hasPendingEvents = false;
        return;
      }

      // 1. Atomically claim batch as PROCESSING in a single roundtrip
      const eventIds = pendingEvents.map((e) => e.id);
      await this.prisma.outboxEvent.updateMany({
        where: { id: { in: eventIds } },
        data: { status: OutboxStatus.PROCESSING },
      });

      // 2. Publish concurrently to RabbitMQ
      const publishedIds: string[] = [];
      const failedIds: string[] = [];

      await Promise.all(
        pendingEvents.map(async (event) => {
          const success = await this.rabbitmq.publish(
            event.eventType,
            event.payload,
          );
          if (success) {
            publishedIds.push(event.id);
          } else {
            failedIds.push(event.id);
          }
        }),
      );

      // 3. Batch settle successful publishes in a single updateMany
      if (publishedIds.length > 0) {
        await this.prisma.outboxEvent.updateMany({
          where: { id: { in: publishedIds } },
          data: {
            status: OutboxStatus.PUBLISHED,
            processedAt: new Date(),
          },
        });
      }

      // 4. Batch settle failed publishes with attempt increment
      if (failedIds.length > 0) {
        await this.prisma.outboxEvent.updateMany({
          where: { id: { in: failedIds } },
          data: {
            status: OutboxStatus.FAILED,
            attempts: { increment: 1 },
            lastError: 'RabbitMQ publish failed or disconnected',
          },
        });
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
