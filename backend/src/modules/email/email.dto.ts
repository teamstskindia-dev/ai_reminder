import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsISO8601, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { ApiDateTime, ApiInteger, ApiUuid } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';

const CATEGORIES = ['urgent', 'needs_reply', 'fyi', 'promotion', 'phishing', 'sensitive'];
const STATUSES = ['new', 'alerted', 'held', 'replied', 'done', 'dismissed'];

// ---------- requests ----------
export class ListEmailsQueryDto extends PaginationQueryDto {
  /** important = urgent; fyi includes promotions; all = everything except promotions. */
  @ApiPropertyOptional({ enum: ['important', 'needs_reply', 'fyi', 'all'], default: 'all' })
  @IsOptional()
  @IsIn(['important', 'needs_reply', 'fyi', 'all'])
  filter?: 'important' | 'needs_reply' | 'fyi' | 'all';
}

export class EmailFeedbackDto {
  /** not_important: stop alerting on this sender. always_alert: make them a VIP (breaks through quiet hours). */
  @ApiProperty({ enum: ['not_important', 'always_alert'] })
  @IsIn(['not_important', 'always_alert'])
  kind: 'not_important' | 'always_alert';
}

export class EmailStatusDto {
  @ApiProperty({ enum: ['done', 'new'] })
  @IsIn(['done', 'new'])
  status: 'done' | 'new';
}

export class EmailRemindDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  remindAt: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @Length(1, 300)
  title?: string;
}

export class EmailDetectedActionDto {
  /** reminder: remind before it is due; calendar: add it to Google Calendar; dismiss. */
  @ApiProperty({ enum: ['reminder', 'calendar', 'dismiss'] })
  @IsIn(['reminder', 'calendar', 'dismiss'])
  action: 'reminder' | 'calendar' | 'dismiss';

  /** reminder only; default: a day before it is due. */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  remindAt?: string;
}

export class EmailDraftDto {
  /** What the user wants to say ("yes, Thursday works"). */
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instructions?: string;
}

export class EmailSendDto {
  @ApiProperty({ maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  to: string;

  @ApiProperty({ maxLength: 300 })
  @IsString()
  @Length(1, 300)
  subject: string;

  @ApiProperty({ maxLength: 10000 })
  @IsString()
  @Length(1, 10000)
  body: string;
}

// ---------- responses ----------
export class EmailDetected implements Contract.EmailDetected {
  @ApiUuid() id: string;
  @ApiProperty({ enum: ['deadline', 'bill', 'booking', 'travel'] }) kind: Contract.EmailDetected['kind'];
  title: string;
  @ApiDateTime() dueAt: string | null;
  @ApiProperty({ enum: ['open', 'added', 'dismissed'] }) status: Contract.EmailDetected['status'];
  @ApiUuid() reminderId: string | null;
}

export class EmailItem implements Contract.EmailItem {
  @ApiUuid() id: string;
  @ApiProperty({ enum: ['gmail', 'outlook'] }) provider: Contract.EmailProvider;
  fromName: string | null;
  fromEmail: string | null;
  /** null for sensitive mail: codes, passwords and statements are never kept. */
  subject: string | null;
  /** One line: what it says or asks. */
  summary: string | null;
  /** Why it matters. */
  why: string | null;
  @ApiProperty({ enum: CATEGORIES }) category: Contract.EmailCategory;
  @ApiProperty({ enum: STATUSES }) status: Contract.EmailStatus;
  @ApiDateTime() receivedAt: string;
  /** Deadlines, bills, bookings and travel still to confirm. */
  @ApiInteger({ minimum: 0 }) openDetected: number;
  /** The sender is on the user's always-alert list. */
  isVip: boolean;
}

export class EmailDetail extends EmailItem implements Contract.EmailDetail {
  @ApiProperty({ type: [EmailDetected] }) detected: EmailDetected[];
  @ApiUuid() reminderId: string | null;
  /** The connected account may send the reply (read + send). */
  canSend: boolean;
  accountEmail: string | null;
  /** Opens the email in Gmail / Outlook on the web. */
  webUrl: string | null;
}

export class EmailReplyDraft implements Contract.EmailReplyDraft {
  to: string;
  subject: string;
  body: string;
  /** false: the account is read-only, so the app offers "Open in email app" instead. */
  canSend: boolean;
}

export class TodayEmails implements Contract.TodayEmails {
  /** Gmail or Outlook is connected. */
  connected: boolean;
  /** Urgent and needs-a-reply emails still open (last 3 days). */
  @ApiProperty({ type: [EmailItem] }) needYou: EmailItem[];
  @ApiInteger({ minimum: 0 }) needYouCount: number;
  /** FYI and newsletters from the last day (the email digest in the brief). */
  @ApiProperty({ type: [EmailItem] }) fyi: EmailItem[];
  @ApiInteger({ minimum: 0 }) fyiCount: number;
}
