import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';
import { MEETING_STATUSES } from '../../../common/types/api.types';
import { IsMeetUrl, normalizeMeetUrl } from '../../../common/validation/safe-url';
import { IsDateTime, IsOptionalNonNull } from '../../../common/validation/validators';

/** One status or a comma-separated list, e.g. `completed` or `scheduled,in_progress`. */
export const STATUS_LIST_RE = new RegExp(`^(${MEETING_STATUSES.join('|')})(,(${MEETING_STATUSES.join('|')}))*$`);

export class ListMeetingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'past', 'all'], default: 'all' })
  @IsOptional()
  @IsIn(['upcoming', 'past', 'all'])
  scope: 'upcoming' | 'past' | 'all' = 'all';

  @ApiPropertyOptional({
    description: `Status, or a comma-separated list of statuses: ${MEETING_STATUSES.join(', ')}.`,
    pattern: STATUS_LIST_RE.source,
    example: 'completed',
  })
  @IsOptional()
  @Matches(STATUS_LIST_RE, { message: `status must be one of ${MEETING_STATUSES.join(', ')}` })
  status?: string;

  /** Search in the title. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** Only meetings starting at or after this time. */
  @IsOptional()
  @IsDateTime()
  from?: string;

  /** Only meetings starting before this time. */
  @IsOptional()
  @IsDateTime()
  to?: string;

  @ApiPropertyOptional({ enum: ['startAt:asc', 'startAt:desc'] })
  @IsOptional()
  @IsIn(['startAt:asc', 'startAt:desc'])
  sort?: 'startAt:asc' | 'startAt:desc';
}

export class CreateMeetingDto {
  @ApiProperty({ example: 'Weekly sync' })
  @IsString()
  @Length(1, 300)
  title: string;

  @ApiProperty({
    example: 'https://meet.google.com/abc-defg-hij',
    description:
      'Google Meet link: `https://meet.google.com/xxx-xxxx-xxx` or `https://meet.google.com/meet/xxx-xxxx-xxx`; stored in the first form.',
  })
  @Transform(({ value }: { value: unknown }) => normalizeMeetUrl(value) ?? value)
  @IsMeetUrl()
  meetingUrl: string;

  @IsDateTime()
  startAt: string;

  /** Must be after `startAt`. Defaults to one hour after `startAt`. */
  @IsOptionalNonNull()
  @IsDateTime()
  endAt?: string;

  /** Send the bot automatically at `startAt`. */
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

/** Text fields of the multipart upload (the file goes in the `file` part). */
export class UploadMeetingDto {
  @IsString()
  @Length(1, 300)
  title: string;

  /** When the meeting happened. Defaults to now. */
  @IsOptional()
  @IsDateTime()
  startAt?: string;
}
