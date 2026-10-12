import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RabbitMQModule } from '../infrastructure/rabbitmq/rabbitmq.module';
import { NotificationsConsumer } from './consumers/notifications.consumer';
import { NotificationListener } from './listeners/notification.listener';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsSseController } from './sse/notifications-sse.controller';

@Module({
  imports: [RabbitMQModule, AuthModule],
  controllers: [NotificationsController, NotificationsSseController],
  providers: [
    NotificationsService,
    NotificationsConsumer,
    NotificationListener,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
