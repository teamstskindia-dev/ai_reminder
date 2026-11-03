import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
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
import { IsOptionalNonNull, IsOptionalNullable } from '../../../common/validation/validators';

export class ListRemindersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'sent', 'cancelled', 'all'], default: 'pending' })
  @IsOptional()
  @IsIn(['pending', 'sent', 'cancelled', 'all'])
  status: 'pending' | 'sent' | 'cancelled' | 'all' = 'pending';

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
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
  @IsISO8601()
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
  @IsISO8601()
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
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1440)
  minutes: number;
}
