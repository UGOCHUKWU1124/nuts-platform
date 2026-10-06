import { PATH_METADATA } from '@nestjs/common/constants';
import { NotificationsSseController } from './notifications-sse.controller';

describe('NotificationsSseController', () => {
  it('uses stream paths that cannot match the notification detail route', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, NotificationsSseController),
    ).toEqual([
      'notifications/sse/stream',
      'admin/notifications/sse/stream',
      'vendors/notifications/sse/stream',
    ]);
  });
});
