import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';
import { MEETING_STATUSES } from '../../../common/types/api.types';
import { IsMeetUrl } from '../../../common/validation/safe-url';
import { IsOptionalNonNull } from '../../../common/validation/validators';

const STATUS_LIST_RE = new RegExp(`^(${MEETING_STATUSES.join('|')})(,(${MEETING_STATUSES.join('|')}))*$`);

export class ListMeetingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'past', 'all'], default: 'all' })
  @IsOptional()
  @IsIn(['upcoming', 'past', 'all'])
  scope: 'upcoming' | 'past' | 'all' = 'all';

  @ApiPropertyOptional({ description: 'Status, or a comma-separated list of statuses' })
  @IsOptional()
  @Matches(STATUS_LIST_RE, { message: `status must be one of ${MEETING_STATUSES.join(', ')}` })
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ enum: ['startAt:asc', 'startAt:desc'] })
  @IsOptional()
  @IsIn(['startAt:asc', 'startAt:desc'])
  sort?: 'startAt:asc' | 'startAt:desc';
}

export class CreateMeetingDto {
  @IsString()
  @Length(1, 300)
  title: string;

  @ApiProperty({ example: 'https://meet.google.com/abc-defg-hij' })
  @IsMeetUrl()
  meetingUrl: string;

  @IsISO8601()
  startAt: string;

  @IsOptionalNonNull()
  @IsISO8601()
  endAt?: string;

  @IsOptionalNonNull()
  @IsBoolean()
  autoJoin?: boolean;
}

export class UpdateMeetingDto {
  @IsOptionalNonNull()
  @IsString()
  @Length(1, 300)
  title?: string;

  @IsOptionalNonNull()
  @IsBoolean()
  autoJoin?: boolean;
}

export class UploadMeetingDto {
  @IsString()
  @Length(1, 300)
  title: string;

  @IsOptional()
  @IsISO8601()
  startAt?: string;
}
