import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/pagination/pagination';
import { REMINDER_CHANNELS, type ReminderChannel } from '../../../common/types/api.types';
import { ApiInteger } from '../../../common/swagger/api-docs.decorators';
import { IsDateTime, IsOptionalNonNull, IsOptionalNullable } from '../../../common/validation/validators';

export class ListRemindersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'sent', 'cancelled', 'all'], default: 'pending' })
  @IsOptional()
  @IsIn(['pending', 'sent', 'cancelled', 'all'])
  status: 'pending' | 'sent' | 'cancelled' | 'all' = 'pending';

  @IsOptional()
  @IsDateTime()
  from?: string;

  @IsOptional()
  @IsDateTime()
  to?: string;
}

export class CreateReminderDto {
  @IsString()
  @Length(1, 200)
  title: string;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(2000)
  body?: string | null;

  @ApiProperty({ description: 'Must be in the future' })
  @IsDateTime()
  remindAt: string;

  @ApiPropertyOptional({ enum: REMINDER_CHANNELS, isArray: true, default: ['push', 'in_app'] })
  @IsOptionalNonNull()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(REMINDER_CHANNELS, { each: true })
  channels?: ReminderChannel[];

  @IsOptionalNullable()
  @IsUUID()
  meetingId?: string | null;

  @IsOptionalNullable()
  @IsUUID()
  actionItemId?: string | null;
}

export class UpdateReminderDto {
  @IsOptionalNonNull()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(2000)
  body?: string | null;

  @IsOptionalNonNull()
  @IsDateTime()
  remindAt?: string;

  @ApiPropertyOptional({ enum: REMINDER_CHANNELS, isArray: true })
  @IsOptionalNonNull()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(REMINDER_CHANNELS, { each: true })
  channels?: ReminderChannel[];

  @ApiPropertyOptional({ enum: ['cancelled'] })
  @IsOptionalNonNull()
  @IsIn(['cancelled'])
  status?: 'cancelled';
}

export class SnoozeReminderDto {
  /** Remind again this many minutes from now. */
  @ApiInteger()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1440)
  minutes: number;
}
