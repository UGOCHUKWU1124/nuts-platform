import { Controller, Header, MessageEvent, Sse } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ROLE } from '@prisma/client';
import { Observable } from 'rxjs';
import { GetUser } from '@api/modules/shared/decorators/get-user.decorator';
import { BypassResponseInterceptor } from '@api/modules/shared/decorators/bypass-response-interceptor.decorator';
import { Roles } from '@api/modules/shared/decorators/role.decorator';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { NotificationsService } from '../notifications.service';

@ApiTags('NOTIFICATIONS - SSE')
@Roles(ROLE.USER, ROLE.ADMIN, ROLE.VENDOR)
@BypassResponseInterceptor()
@Controller([
  'notifications/sse/stream',
  'admin/notifications/sse/stream',
  'vendors/notifications/sse/stream',
])
export class NotificationsSseController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Sse()
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  @ApiOperation({
    summary: 'Real-time Server-Sent Events stream for user notifications',
    description:
      'Maintains an open SSE connection delivering live in-app notifications and alerts',
  })
  streamNotifications(
    @GetUser() user: AuthenticatedUser,
  ): Observable<MessageEvent> {
    return this.notificationsService.subscribeToUserStream(
      user.id,
      user.role,
      user.sessionId,
    );
  }
}
