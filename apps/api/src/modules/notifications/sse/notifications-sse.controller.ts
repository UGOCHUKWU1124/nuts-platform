import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ROLE } from '@prisma/client';
import { Observable } from 'rxjs';
import { GetUser } from '../../../common/decorators/get-user.decorator';
import { Roles } from '@api/modules/shared/decorators/role.decorator';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { NotificationsService } from '../notifications.service';

@ApiTags('NOTIFICATIONS - SSE')
@Roles(ROLE.USER, ROLE.ADMIN, ROLE.VENDOR)
@Controller([
  'notifications/sse/stream',
  'admin/notifications/sse/stream',
  'vendors/notifications/sse/stream',
])
export class NotificationsSseController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Sse()
  @ApiOperation({
    summary: 'Real-time Server-Sent Events stream for user notifications',
    description:
      'Maintains an open SSE connection delivering live in-app notifications and alerts',
  })
  streamNotifications(
    @GetUser() user: AuthenticatedUser,
  ): Observable<MessageEvent> {
    return this.notificationsService.subscribeToUserStream(user.id);
  }
}
