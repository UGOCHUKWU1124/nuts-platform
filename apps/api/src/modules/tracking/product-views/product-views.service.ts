import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { RABBITMQ_QUEUES } from '@api/modules/infrastructure/rabbitmq/rabbitmq.constants';
import { RabbitMQService } from '@api/modules/infrastructure/rabbitmq/rabbitmq.service';
import { TRACKING } from '@api/modules/shared/constants';

interface BufferedView {
  productId: string;
  userId?: string;
  sessionId?: string;
  timestamp: string;
}

@Injectable()
export class ProductViewsService {
  private readonly logger = new Logger(ProductViewsService.name);
  private readonly viewBufferKey = 'tracking:product_views:buffer';
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly rabbitmq: RabbitMQService,
  ) {
    this.startFlushTimer();
  }

  /**
   * Track a product view — buffers in Redis, flushes to queue periodically.
   */
  async trackView(
    productId: string,
    userId?: string,
    sessionId?: string,
  ): Promise<void> {
    const view: BufferedView = {
      productId,
      userId,
      sessionId: sessionId || randomUUID(),
      timestamp: new Date().toISOString(),
    };

    try {
      await this.redis.rpush(this.viewBufferKey, JSON.stringify(view));
    } catch (err) {
      this.logger.warn(
        `Failed to buffer product view: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Flush buffered views to the analytics queue for DB insertion.
   */
  async flushViews(): Promise<void> {
    try {
      const batchSize = TRACKING.PRODUCT_VIEW_BATCH_SIZE;
      let processed = 0;

      while (true) {
        const raw = await this.redis.lpop(this.viewBufferKey, batchSize);
        if (!raw || raw.length === 0) break;

        const views: BufferedView[] = raw
          .map((item) => {
            try {
              return JSON.parse(item) as BufferedView;
            } catch {
              return null;
            }
          })
          .filter((v): v is BufferedView => v !== null);

        if (views.length > 0) {
          for (const view of views) {
            await this.rabbitmq.publish(RABBITMQ_QUEUES.ANALYTICS, {
              type: 'product_view',
              productId: view.productId,
              userId: view.userId,
              sessionId: view.sessionId,
              timestamp: view.timestamp,
            });
          }
          processed += views.length;
        }
      }

      if (processed > 0) {
        this.logger.debug({ count: processed }, 'Flushed product views to queue');
      }
    } catch (err) {
      this.logger.warn(
        `Failed to flush product views: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private startFlushTimer(): void {
    const interval = TRACKING.PRODUCT_VIEW_FLUSH_INTERVAL_MS;
    this.flushTimer = setInterval(() => {
      void this.flushViews().catch((err) => {
        this.logger.warn(
          `Failed to flush product views interval: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, interval);

    // Prevent timer from keeping process alive
    if (this.flushTimer && typeof this.flushTimer === 'object') {
      this.flushTimer.unref();
    }
  }

  /**
   * Call on module destroy to flush remaining views.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      await this.flushViews();
    } catch {
      // Ignore during shutdown
    }
  }
}
