import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { IsDateTime, IsOptionalNonNull, IsOptionalNullable, ToBoolean } from '../../common/validation/validators';

export class ListActionItemsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'done', 'dismissed', 'all'], default: 'open' })
  @IsOptional()
  @IsIn(['open', 'done', 'dismissed', 'all'])
  status: 'open' | 'done' | 'dismissed' | 'all' = 'open';

  /** Only items from this meeting. */
  @IsOptional()
  @IsUUID()
  meetingId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: '`true` returns only items assigned to me; `false` or omitted returns all.',
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  mine?: boolean;
}

export class CreateActionItemDto {
  @IsString()
  @Length(1, 300)
  title: string;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptionalNullable()
  @IsDateTime()
  dueAt?: string | null;

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high'] })
  @IsOptionalNonNull()
  @IsIn(['low', 'medium', 'high'])
  priority?: 'low' | 'medium' | 'high';

  @IsOptionalNullable()
  @IsUUID()
  meetingId?: string | null;

  @ApiPropertyOptional({ description: 'Creates an action_item_due reminder at dueAt' })
  @IsOptionalNonNull()
  @IsBoolean()
  remind?: boolean;
}

export class UpdateActionItemDto {
  @IsOptionalNonNull()
  @IsString()
  @Length(1, 300)
  title?: string;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptionalNullable()
  @IsDateTime()
  dueAt?: string | null;

  @IsOptionalNonNull()
  @IsIn(['low', 'medium', 'high'])
  priority?: 'low' | 'medium' | 'high';

  @IsOptionalNonNull()
  @IsIn(['open', 'done', 'dismissed'])
  status?: 'open' | 'done' | 'dismissed';
}
