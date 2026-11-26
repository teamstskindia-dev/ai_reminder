import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsISO8601, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { IsNotBlank, IsOptionalNonNull, IsOptionalNullable } from '../../common/validation/validators';
import { ApiDateTime, ApiInteger } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';

const KINDS = ['conversation', 'meeting', 'checkin', 'email'];

// ---------- requests ----------
export class TimelineQueryDto {
  /** Older memories: pass the previous page's `nextCursor`. */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  before?: string;
}

export class MemorySearchQueryDto {
  /** Anything, by meaning: "when was I worried about money?" */
  @ApiProperty({ minLength: 1, maxLength: 300 })
  @IsString()
  @Length(1, 300)
  q: string;
}

export class PeopleQueryDto {
  /** Filter by name, other spelling or relationship. */
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class FixNameDto {
  /** The name as it appears now (a speaker label like "Speaker 2" or a misheard name). */
  @IsString()
  @Length(1, 120)
  from: string;

  @IsString()
  @Length(1, 120)
  to: string;

  /** Only in this conversation (real names are otherwise fixed everywhere and remembered). */
  @IsOptional()
  @IsBoolean()
  onlyHere?: boolean;
}

export class UpdateSummaryDto {
  @IsString()
  @IsNotBlank()
  @Length(1, 20_000)
  summary: string;
}

export class UpdateSegmentDto {
  @IsString()
  @IsNotBlank()
  @Length(1, 5000)
  text: string;
}

export class CreatePersonDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptionalNullable()
  @IsString()
  @Length(1, 80)
  relationship?: string | null;

  @IsOptionalNonNull()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  facts?: string[];
}

export class UpdatePersonDto {
  /** A new name is fixed in every conversation with them and remembered for next time. */
  @IsOptionalNonNull()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptionalNullable()
  @IsString()
  @Length(1, 80)
  relationship?: string | null;

  /** The full list of key facts (replaces the stored list). */
  @IsOptionalNonNull()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  facts?: string[];
}

export class CorrectionQueryDto {
  @IsString()
  @Length(1, 120)
  from: string;
}

// ---------- responses ----------
export class MemoryItem implements Contract.MemoryItem {
  @ApiProperty({ enum: KINDS }) kind: Contract.MemoryKind;
  /** Opens /capture/:id (conversation), /meeting/:id (meeting), /email/:id (email); check-ins show inline. */
  id: string;
  title: string;
  snippet: string | null;
  @ApiDateTime() at: string;
  @ApiInteger({ minimum: 1, maximum: 5 }) mood: number | null;
  people: string[];
}

export class MemoryDay implements Contract.MemoryDay {
  @ApiProperty({ example: '2026-11-21' }) date: string;
  @ApiProperty({ type: [MemoryItem] }) items: MemoryItem[];
}

export class MemoryTimeline implements Contract.MemoryTimeline {
  @ApiProperty({ type: [MemoryDay] }) days: MemoryDay[];
  @ApiDateTime() nextCursor: string | null;
}

export class MemorySearchResult implements Contract.MemorySearchResult {
  @ApiProperty({ type: MemoryItem }) item: MemoryItem;
  quote: string | null;
  similarity: number | null;
}

export class MemorySearch implements Contract.MemorySearch {
  query: string;
  @ApiProperty({ type: [MemorySearchResult] }) results: MemorySearchResult[];
  /** Filled only when nothing matched. */
  @ApiProperty({ type: [MemoryItem] }) related: MemoryItem[];
}

export class PersonListItem implements Contract.PersonListItem {
  id: string;
  name: string;
  relationship: string | null;
  @ApiDateTime() lastTalkedAt: string | null;
  @ApiInteger({ minimum: 0 }) conversationCount: number;
  @ApiInteger({ minimum: 0 }) openPromises: number;
}

export class PersonPromise implements Contract.PersonPromise {
  id: string;
  title: string;
  @ApiDateTime() dueAt: string | null;
  status: string;
}

export class PersonPromises {
  @ApiProperty({ type: [PersonPromise] }) iOwe: PersonPromise[];
  @ApiProperty({ type: [PersonPromise] }) theyOwe: PersonPromise[];
}

export class PersonDetail extends PersonListItem implements Contract.PersonDetail {
  facts: string[];
  aliases: string[];
  @ApiProperty({ type: PersonPromises }) promises: PersonPromises;
  @ApiProperty({ type: [MemoryItem] }) conversations: MemoryItem[];
}

export class NameFixResult {
  @ApiInteger({ minimum: 0 }) conversations: number;
  /** True when future transcripts will use the new name. */
  remembered: boolean;
}

export class NameCorrection implements Contract.NameCorrection {
  from: string;
  to: string;
}

export class SummaryUpdated {
  summary: string;
}

export class SegmentUpdated {
  @ApiInteger({ minimum: 0 }) seq: number;
  text: string;
}

export class DataExportStatus implements Contract.DataExportStatus {
  @ApiProperty({ enum: ['none', 'preparing', 'ready'] }) status: Contract.DataExportState;
  /** Download link (works for 3 days, no sign-in needed). */
  url: string | null;
  @ApiDateTime() requestedAt: string | null;
  @ApiDateTime() expiresAt: string | null;
}
