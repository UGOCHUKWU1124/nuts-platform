import { Controller, MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ROLE } from '@prisma/client';
import { Observable } from 'rxjs';
import { GetUser } from '../../../common/decorators/get-user.decorator';
import { Roles } from '@api/modules/shared/decorators/role.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { NotificationsService } from '../notifications.service';

@ApiTags('NOTIFICATIONS - SSE')
@UseGuards(JwtAuthGuard)
@Roles(ROLE.USER, ROLE.ADMIN, ROLE.VENDOR)
@Controller([
  'notifications/sse',
  'admin/notifications/sse',
  'vendors/notifications/sse',
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
