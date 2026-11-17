import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  ValidateNested,
} from 'class-validator';
import { ApiDateTime, ApiInteger, ApiUuid } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';
import { ActionItem } from '../action-items/action-items.responses.dto';
import { Reminder } from '../reminders/dto/reminders.responses.dto';

/** 6 hours: longer recordings are stopped by the app. */
export const MAX_CAPTURE_MS = 6 * 3600_000;
/** At most this many parts per capture (5-minute parts → 6 hours). */
export const MAX_CAPTURE_PARTS = 80;

// ---------- requests ----------
export class CaptureBookmarkDto {
  @ApiProperty({ minimum: 0, example: 754000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_CAPTURE_MS)
  atMs: number;

  @ApiProperty({ required: false, nullable: true, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;
}

export class CreateCaptureDto {
  /** Generated on the phone when recording starts; makes this call safe to retry. */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId: string;

  @ApiProperty({ required: false, maxLength: 300, example: 'Coffee with Rahul' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  /** When recording started. */
  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  startedAt: string;

  /** The calendar meeting this recording belongs to ("Meeting starting: record it?", quick notes). */
  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  meetingId?: string;
}

export class UploadCapturePartDto {
  /** Length of this part in milliseconds (used to place its transcript on the timeline). */
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_CAPTURE_MS)
  durationMs: number;
}

export class FinishCaptureDto {
  /** Number of parts the phone uploaded (indexes 0..partCount-1 must all be present). */
  @ApiProperty({ minimum: 1, maximum: MAX_CAPTURE_PARTS })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CAPTURE_PARTS)
  partCount: number;

  /** Total recorded time, pauses excluded. */
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_CAPTURE_MS)
  durationMs: number;

  @ApiProperty({ required: false, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiProperty({ required: false, type: [CaptureBookmarkDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CaptureBookmarkDto)
  bookmarks?: CaptureBookmarkDto[];
}

export class UpdateCaptureDto {
  @ApiProperty({ required: false, maxLength: 300 })
  @IsOptional()
  @IsString()
  @Length(1, 300)
  title?: string;

  /** Link the recording to a calendar meeting, or null to keep it standalone. */
  @ApiProperty({ required: false, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  linkedMeetingId?: string | null;
}

export class FollowUpDecisionDto {
  @ApiProperty({ enum: ['sent', 'skipped'] })
  @IsIn(['sent', 'skipped'])
  status: 'sent' | 'skipped';

  /** The subject and body as the user edited them before sending. */
  @ApiProperty({ required: false, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  @ApiProperty({ required: false, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;
}

export class ReviewSuggestionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;

  @ApiProperty({ enum: ['confirm', 'dismiss'] })
  @IsIn(['confirm', 'dismiss'])
  action: 'confirm' | 'dismiss';

  /** The reminder title as the user fixed it (confirm only). */
  @ApiProperty({ required: false, maxLength: 300 })
  @IsOptional()
  @IsString()
  @Length(1, 300)
  title?: string;

  /** When to remind (confirm only; required when the suggestion has no time). */
  @ApiProperty({ required: false, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  remindAt?: string;
}

export class ReviewCaptureDto {
  @ApiProperty({ required: false, type: [ReviewSuggestionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReviewSuggestionDto)
  suggestions?: ReviewSuggestionDto[];

  /** Facts about the user (from `insights.userFacts`) the user wants the friend to remember. */
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  saveFacts?: string[];
}

export class ListCapturesQueryDto {
  @ApiProperty({ required: false, minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
}

// ---------- responses ----------
export class CaptureBookmark implements Contract.CaptureBookmark {
  @ApiInteger({ minimum: 0 }) atMs: number;
  label: string | null;
}

export class CapturePerson implements Contract.CapturePerson {
  name: string;
  relation: string | null;
  notes: string[];
}

export class CaptureSuggestionOption implements Contract.CaptureSuggestionOption {
  label: string;
  title: string;
  @ApiDateTime() remindAt: string | null;
}

export class CaptureSuggestion implements Contract.CaptureSuggestion {
  @ApiUuid() id: string;
  title: string;
  body: string | null;
  @ApiDateTime() remindAt: string | null;
  /** What the friend wants to check, e.g. "Rohit or Rahul?". */
  question: string;
  @ApiProperty({ type: [CaptureSuggestionOption] }) options: CaptureSuggestionOption[];
  @ApiProperty({ enum: ['open', 'confirmed', 'dismissed'] }) status: 'open' | 'confirmed' | 'dismissed';
  @ApiUuid('The reminder created when the suggestion was confirmed.') reminderId: string | null;
}

export class CaptureInsights implements Contract.CaptureInsights {
  @ApiProperty({ type: [CapturePerson] }) people: CapturePerson[];
  userFacts: string[];
  savedFacts: string[];
  @ApiProperty({ enum: ['happy', 'calm', 'neutral', 'stressed', 'low'], nullable: true })
  mood: Contract.CaptureMood | null;
  @ApiInteger({ minimum: 1, maximum: 5 }) energy: number | null;
  @ApiProperty({ type: [CaptureSuggestion] }) suggestions: CaptureSuggestion[];
}

export class CaptureListItem implements Contract.CaptureListItem {
  @ApiUuid() id: string;
  title: string;
  @ApiProperty({ enum: ['uploading', 'processing', 'completed', 'failed'] }) status: Contract.CaptureStatus;
  @ApiDateTime() startAt: string;
  @ApiInteger({ minimum: 0 }) durationSeconds: number | null;
  summaryPreview: string | null;
  @ApiInteger({ minimum: 0 }) actionItemCount: number;
  @ApiInteger({ minimum: 0 }) reminderCount: number;
  @ApiInteger({ minimum: 0 }) openSuggestionCount: number;
  @ApiDateTime() reviewedAt: string | null;
  failureReason: string | null;
  noSpeech: boolean;
  @ApiDateTime() createdAt: string;
}

export class CaptureDetail extends CaptureListItem implements Contract.CaptureDetail {
  summary: string | null;
  keyPoints: string[];
  decisions: string[];
  @ApiProperty({ type: [CaptureBookmark] }) bookmarks: CaptureBookmark[];
  @ApiProperty({ type: [ActionItem] }) actionItems: ActionItem[];
  @ApiProperty({ type: [Reminder] }) reminders: Reminder[];
  @ApiProperty({ type: CaptureInsights, nullable: true }) insights: CaptureInsights | null;
  @ApiInteger({ minimum: 0 }) partsUploaded: number;
  audioKept: boolean;
  @ApiProperty({ type: () => MeetingRef, nullable: true }) linkedMeeting: MeetingRef | null;
  @ApiProperty({ type: () => [MeetingRef] }) eventSuggestions: MeetingRef[];
  @ApiProperty({ type: () => FollowUpDraft, nullable: true }) followUp: FollowUpDraft | null;
}

export class MeetingRef implements Contract.MeetingRef {
  @ApiUuid() id: string;
  title: string;
  @ApiDateTime() startAt: string;
  @ApiDateTime() endAt: string | null;
}

export class FollowUpRecipient {
  name: string | null;
  email: string;
}

export class FollowUpDraft implements Contract.FollowUpDraft {
  @ApiProperty({ type: [FollowUpRecipient] }) to: FollowUpRecipient[];
  subject: string;
  body: string;
  @ApiProperty({ enum: ['draft', 'sent', 'skipped'] }) status: 'draft' | 'sent' | 'skipped';
}

export class CapturePartResult {
  @ApiInteger({ minimum: 0 }) index: number;
  /** Parts stored so far. */
  @ApiInteger({ minimum: 1 }) partsUploaded: number;
}
