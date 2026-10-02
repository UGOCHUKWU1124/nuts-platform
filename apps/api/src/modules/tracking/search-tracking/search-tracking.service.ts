import { Injectable, Logger } from '@nestjs/common';
import { RABBITMQ_QUEUES } from 'src/modules/infrastructure/rabbitmq/rabbitmq.constants';
import { RabbitMQService } from 'src/modules/infrastructure/rabbitmq/rabbitmq.service';

@Injectable()
export class SearchTrackingService {
  private readonly logger = new Logger(SearchTrackingService.name);

  constructor(private readonly rabbitmq: RabbitMQService) {}

  /**
   * Track a search query for analytics.
   */
  async trackSearch(
    query: string,
    resultsCount: number,
    userId?: string,
    sessionId?: string,
  ): Promise<void> {
    await this.rabbitmq.publish(RABBITMQ_QUEUES.ANALYTICS, {
      type: 'search',
      query,
      resultsCount,
      userId,
      sessionId,
      timestamp: new Date().toISOString(),
    });

    if (resultsCount === 0) {
      this.logger.debug({ query }, 'Zero-result search tracked');
    }
  }
}
