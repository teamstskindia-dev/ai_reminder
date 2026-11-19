import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { ApiDateTime, ApiUuid } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';

const PROVIDERS = ['notion', 'jira', 'linear', 'todoist'];

// ---------- requests ----------
export class CreateToolTaskDto {
  /** Omit to use the first connected tool. */
  @ApiPropertyOptional({ enum: PROVIDERS })
  @IsOptional()
  @IsIn(PROVIDERS)
  provider?: Contract.ToolProvider;

  /** Send this to-do (its title, details, owner and due date are used). */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actionItemId?: string;

  /** Required without `actionItemId`; overrides the to-do's title otherwise. */
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @Length(1, 300)
  title?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  details?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  /** Someone else owns it: assigned in the tool when the name is unambiguous, else noted in the task. */
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;

  @ApiPropertyOptional({ enum: ['meeting', 'email', 'chat', 'manual'], default: 'manual' })
  @IsOptional()
  @IsIn(['meeting', 'email', 'chat', 'manual'])
  source?: Contract.ToolTaskSource;

  /** Create even though a similar open task exists (after the user chose "create new"). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  /** Merge into this existing task (the `duplicate.externalId` the API returned) instead. */
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mergeWithExternalId?: string;
}

export class ListToolTasksQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actionItemId?: string;
}

// ---------- responses ----------
export class ToolTask implements Contract.ToolTask {
  @ApiUuid() id: string;
  @ApiProperty({ enum: PROVIDERS }) provider: Contract.ToolProvider;
  title: string;
  /** JIRA-123 / ENG-42 when the tool has keys. */
  externalKey: string | null;
  url: string | null;
  /** pending: not in the tool yet (retrying or waiting for a reconnect). */
  @ApiProperty({ enum: ['pending', 'open', 'done', 'failed'] }) status: Contract.ToolTaskStatus;
  @ApiProperty({ enum: ['meeting', 'email', 'chat', 'manual'] }) source: Contract.ToolTaskSource;
  @ApiUuid() actionItemId: string | null;
  ownerName: string | null;
  @ApiDateTime() dueAt: string | null;
  lastError: string | null;
  @ApiDateTime() createdAt: string;
}

export class ToolDuplicate implements Contract.ToolDuplicate {
  externalId: string;
  externalKey: string | null;
  title: string;
  url: string | null;
}

export class ToolTaskResult implements Contract.ToolTaskResult {
  /** created · duplicate (nothing created: ask merge or new) · linked (merged / already sent) · queued (retrying). */
  @ApiProperty({ enum: ['created', 'duplicate', 'linked', 'queued'] }) outcome: Contract.ToolTaskResult['outcome'];
  @ApiProperty({ type: ToolTask, nullable: true }) task: ToolTask | null;
  @ApiProperty({ type: ToolDuplicate, nullable: true }) duplicate: ToolDuplicate | null;
}
