import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RabbitMQModule } from '../infrastructure/rabbitmq/rabbitmq.module';
import { NotificationsConsumer } from './consumers/notifications.consumer';
import { NotificationListener } from './listeners/notification.listener';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsSseController } from './sse/notifications-sse.controller';
import { WebPushService } from './push/push.service';
import { PushSubscriptionsController } from './push/push.controller';
import { NotificationPreferencesService } from './preferences/preferences.service';
import { NotificationPreferencesController } from './preferences/preferences.controller';

@Module({
  imports: [RabbitMQModule, AuthModule],
  controllers: [
    NotificationPreferencesController,
    PushSubscriptionsController,
    NotificationsSseController,
    NotificationsController,
  ],
  providers: [
    NotificationsService,
    NotificationsConsumer,
    NotificationListener,
    WebPushService,
    NotificationPreferencesService,
  ],
  exports: [
    NotificationsService,
    WebPushService,
    NotificationPreferencesService,
  ],
})
export class NotificationsModule {}
