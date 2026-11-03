import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { ToBoolean } from '../../common/validation/validators';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { NotificationsService } from './notifications.service';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  unreadOnly?: boolean;
}

@ApiTags('notifications')
@UserAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUserId() userId: string, @Query() q: ListNotificationsQueryDto) {
    return this.notifications.list(userId, q.unreadOnly === true, q.page, q.limit);
  }

  @Get('unread-count')
  unreadCount(@CurrentUserId() userId: string) {
    return this.notifications.unreadCount(userId);
  }

  @Patch(':id/read')
  markRead(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(userId, id);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUserId() userId: string) {
    return this.notifications.markAllRead(userId);
  }
}
