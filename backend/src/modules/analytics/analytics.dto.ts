import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { ApiDateTime, ApiInteger } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';

/** `YYYY-MM-DD` (a day in the user time zone) or an ISO-8601 timestamp. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/;

export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    enum: ['7d', '30d', '90d'],
    default: '30d',
    description: 'Rolling window ending now. Ignored when `from` and `to` are given.',
  })
  @IsOptional()
  @IsIn(['7d', '30d', '90d'])
  range?: '7d' | '30d' | '90d';

  @ApiPropertyOptional({
    description: 'Start (inclusive): `YYYY-MM-DD` in the user time zone, or an ISO timestamp. Requires `to`.',
    pattern: DATE_RE.source,
    example: '2026-10-01',
  })
  @IsOptional()
  @Matches(DATE_RE, { message: 'from must be YYYY-MM-DD or an ISO timestamp' })
  from?: string;

  @ApiPropertyOptional({
    description:
      'End: a `YYYY-MM-DD` day is included in full; a timestamp is exclusive. Requires `from`. ' +
      'The range can be at most 366 days.',
    pattern: DATE_RE.source,
    example: '2026-10-31',
  })
  @IsOptional()
  @Matches(DATE_RE, { message: 'to must be YYYY-MM-DD or an ISO timestamp' })
  to?: string;
}

// ---------- responses ----------

export class AnalyticsRange {
  @ApiDateTime() from: string;
  @ApiDateTime() to: string;
}

export class AnalyticsTotals {
  @ApiInteger({ minimum: 0 }) meetings: number;
  totalMinutes: number;
  avgMeetingMinutes: number;
  avgMeetingScore: number | null;
  avgEngagementScore: number | null;
  avgSentimentScore: number | null;
  @ApiInteger({ minimum: 0 }) actionItemsCreated: number;
  @ApiInteger({ minimum: 0 }) actionItemsCompleted: number;
}

export class AnalyticsDay {
  /** `YYYY-MM-DD` in the user time zone. */
  @ApiProperty({ format: 'date', example: '2026-10-01' }) date: string;
  @ApiInteger({ minimum: 0 }) meetings: number;
  minutes: number;
  avgScore: number | null;
}

export class SentimentBreakdown {
  @ApiInteger({ minimum: 0 }) positive: number;
  @ApiInteger({ minimum: 0 }) neutral: number;
  @ApiInteger({ minimum: 0 }) negative: number;
}

export class TopicCount {
  topic: string;
  @ApiInteger({ minimum: 0 }) count: number;
}

export class TopParticipant {
  name: string;
  @ApiInteger({ minimum: 0 }) meetings: number;
  @ApiInteger({ minimum: 0 }) talkTimeSeconds: number;
}

export class HourBucket {
  /** Hour of day in the user time zone. */
  @ApiInteger({ minimum: 0, maximum: 23 }) hour: number;
  @ApiInteger({ minimum: 0 }) meetings: number;
}

export class AnalyticsOverview implements Contract.AnalyticsOverview {
  /** The resolved `[from, to)` window. */
  range: AnalyticsRange;
  totals: AnalyticsTotals;
  byDay: AnalyticsDay[];
  sentimentBreakdown: SentimentBreakdown;
  topTopics: TopicCount[];
  topParticipants: TopParticipant[];
  byHourOfDay: HourBucket[];
}
