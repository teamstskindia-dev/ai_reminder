import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { ApiDateTime, ApiInteger, ApiUuid } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';
import { ToBoolean } from '../../common/validation/validators';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: Boolean, description: 'Only unread notifications.' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  unreadOnly?: boolean;
}

// ---------- responses ----------

export class AppNotification implements Contract.AppNotification {
  @ApiUuid() id: string;
  type: Contract.NotificationType;
  title: string;
  body: string | null;
  /** Deep-link data, e.g. `{ "meetingId": "…" }`. */
  @ApiProperty({ type: 'object', additionalProperties: true }) data: Record<string, unknown>;
  @ApiDateTime() readAt: string | null;
  @ApiDateTime() createdAt: string;
}

export class UnreadCount {
  @ApiInteger({ minimum: 0 }) count: number;
}

export class MarkAllReadResult {
  /** Number of notifications marked read. */
  @ApiInteger({ minimum: 0 }) updated: number;
}
