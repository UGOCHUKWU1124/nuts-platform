import { Injectable, Logger, Optional } from '@nestjs/common';
import { OutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxRelay } from './outbox.relay';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly outboxRelay?: OutboxRelay,
  ) {}

  /**
   * Appends an outbox event inside an ongoing database transaction.
   * Guarantees atomic business mutation + event persistence.
   */
  async appendEvent(
    tx: Prisma.TransactionClient,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        aggregateType,
        aggregateId,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        status: OutboxStatus.PENDING,
      },
    });

    this.outboxRelay?.notifyNewEvent();
  }
}
