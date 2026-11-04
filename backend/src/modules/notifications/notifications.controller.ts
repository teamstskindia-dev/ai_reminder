import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiDataResponse, ApiErrors, ApiPaginatedResponse } from '../../common/swagger/api-docs.decorators';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { AppNotification, ListNotificationsQueryDto, MarkAllReadResult, UnreadCount } from './notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@UserAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications, newest first' })
  @ApiPaginatedResponse(AppNotification)
  list(@CurrentUserId() userId: string, @Query() q: ListNotificationsQueryDto) {
    return this.notifications.list(userId, q.unreadOnly === true, q.page, q.limit);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count unread notifications (for the badge)' })
  @ApiDataResponse(UnreadCount)
  unreadCount(@CurrentUserId() userId: string) {
    return this.notifications.unreadCount(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ApiDataResponse(AppNotification)
  @ApiErrors('NOT_FOUND')
  markRead(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(userId, id);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiDataResponse(MarkAllReadResult)
  markAllRead(@CurrentUserId() userId: string) {
    return this.notifications.markAllRead(userId);
  }
}
