import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationType, ROLE } from '@prisma/client';
import { GetUser } from '@api/modules/shared/decorators/get-user.decorator';
import { Roles } from '@api/modules/shared/decorators/role.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { NotificationsService } from './notifications.service';

@ApiTags('NOTIFICATIONS')
@Controller('notifications')
@Roles(ROLE.USER, ROLE.ADMIN, ROLE.VENDOR)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List notifications for current user with cursor pagination',
  })
  async list(
    @GetUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('type') type?: NotificationType,
    @Query('category') category?: string,
  ) {
    const parsedLimit = limit === undefined ? 20 : Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      throw new BadRequestException('limit must be a positive integer');
    }
    if (category && category !== 'orders' && category !== 'payments') {
      throw new BadRequestException('category must be orders or payments');
    }
    if (type && !Object.values(NotificationType).includes(type)) {
      throw new BadRequestException('type is invalid');
    }

    return this.notificationsService.list(user.id, user.role, {
      cursor,
      limit: parsedLimit,
      unreadOnly: unreadOnly === 'true',
      type,
      category:
        category === 'orders' || category === 'payments' ? category : undefined,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread notification count' })
  async getUnreadCount(@GetUser() user: AuthenticatedUser) {
    const count = await this.notificationsService.getUnreadCount(
      user.id,
      user.role,
    );
    return { count };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a notification for the current user' })
  async getById(@Param('id') id: string, @GetUser() user: AuthenticatedUser) {
    return this.notificationsService.getById(id, user.id, user.role);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(
    @Param('id') id: string,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.markAsRead(id, user.id, user.role);
  }

  @Patch('mark-all-read')
  @ApiOperation({ summary: 'Mark all unread notifications as read' })
  async markAllAsRead(@GetUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(user.id, user.role);
  }

  @Delete('clear-all')
  @ApiOperation({ summary: 'Clear all read notifications' })
  async clearAll(@GetUser() user: AuthenticatedUser) {
    return this.notificationsService.clearAll(user.id, user.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a single notification' })
  async delete(@Param('id') id: string, @GetUser() user: AuthenticatedUser) {
    return this.notificationsService.delete(id, user.id, user.role);
  }
}
