import { ApiProperty, OmitType } from '@nestjs/swagger';
import { ApiDateTime, ApiInteger, ApiUuid } from '../../../common/swagger/api-docs.decorators';
import type * as Contract from '../../../common/types/api.types';
import { ActionItem } from '../../action-items/action-items.responses.dto';

export class Attendee implements Contract.Attendee {
  email: string;
  name: string | null;
  /** Calendar RSVP: `accepted`, `declined`, `tentative` or `needsAction`. */
  responseStatus: string | null;
  organizer: boolean;
}

export class ReportSummary implements Contract.ReportSummary {
  /** Start of the AI summary (up to 240 characters). */
  summaryPreview: string;
  @ApiProperty({ minimum: 0, maximum: 100 }) meetingScore: number | null;
  @ApiProperty({ minimum: 0, maximum: 100 }) engagementScore: number | null;
  /** 0 (negative) to 100 (positive). */
  @ApiProperty({ minimum: 0, maximum: 100 }) sentimentScore: number | null;
  sentimentLabel: Contract.SentimentLabel | null;
  topics: string[];
}

export class MeetingListItem implements Contract.MeetingListItem {
  @ApiUuid() id: string;
  title: string;
  @ApiDateTime() startAt: string;
  @ApiDateTime() endAt: string | null;
  platform: Contract.MeetingPlatform;
  meetingUrl: string | null;
  status: Contract.MeetingStatus;
  source: Contract.MeetingSource;
  /** The bot joins automatically at `startAt`. */
  autoJoin: boolean;
  @ApiInteger() durationSeconds: number | null;
  organizerEmail: string | null;
  @ApiInteger() attendeeCount: number;
  @ApiInteger() actionItemCount: number;
  /** Present once the AI report is ready. */
  report: ReportSummary | null;
}

export class ReportChapter {
  title: string;
  summary: string;
  /** Offset from the start of the recording, in milliseconds. */
  @ApiInteger() startMs: number;
}

export class ReportQuestion {
  question: string;
  answer: string | null;
  askedBy: string | null;
}

export class MeetingReport implements Contract.MeetingReport {
  /** Markdown summary. */
  summary: string;
  keyPoints: string[];
  chapters: ReportChapter[];
  keyQuestions: ReportQuestion[];
  decisions: string[];
  topics: string[];
  @ApiProperty({ minimum: 0, maximum: 100 }) meetingScore: number | null;
  @ApiProperty({ minimum: 0, maximum: 100 }) engagementScore: number | null;
  /** 0 (negative) to 100 (positive). */
  @ApiProperty({ minimum: 0, maximum: 100 }) sentimentScore: number | null;
  sentimentLabel: Contract.SentimentLabel | null;
  /** AI model that wrote the report. */
  model: string | null;
  @ApiDateTime() createdAt: string;
}

export class Participant implements Contract.Participant {
  @ApiUuid() id: string;
  /** Name as shown in the meeting captions. */
  name: string;
  email: string | null;
  @ApiInteger() talkTimeSeconds: number;
  @ApiInteger() wordCount: number;
  /** Share of all spoken words, as a percentage (0–100). */
  @ApiProperty({ minimum: 0, maximum: 100 }) talkRatio: number;
}

export class MeetingDetail extends OmitType(MeetingListItem, ['report'] as const) implements Contract.MeetingDetail {
  description: string | null;
  attendees: Attendee[];
  participants: Participant[];
  report: MeetingReport | null;
  actionItems: ActionItem[];
  @ApiDateTime() botJoinedAt: string | null;
  @ApiDateTime() botLeftAt: string | null;
  /** Why the bot or the AI pipeline failed (shown to the user). */
  failureReason: string | null;
}

export class TranscriptSegment implements Contract.TranscriptSegment {
  @ApiInteger() seq: number;
  speaker: string;
  text: string;
  @ApiInteger() startMs: number;
  @ApiInteger() endMs: number | null;
}
