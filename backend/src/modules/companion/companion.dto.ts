import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { ApiDateTime, ApiInteger, ApiUuid } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';
import { ActionItem } from '../action-items/action-items.responses.dto';
import { MeetingListItem } from '../meetings/dto/meetings.responses.dto';
import { Reminder } from '../reminders/dto/reminders.responses.dto';

// ---------- requests ----------
export class CompanionTextDto {
  @ApiProperty({ example: 'Pretty good! Finally shipped the onboarding.' })
  @IsString()
  @Length(1, 1000)
  text: string;
}

export class MoodQueryDto {
  @ApiProperty({ required: false, minimum: 7, maximum: 90, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(90)
  days: number = 30;
}

export class RecapsQueryDto {
  @ApiProperty({ required: false, minimum: 1, maximum: 12, default: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit: number = 4;
}

// ---------- responses ----------
export class CompanionMessage implements Contract.CompanionMessage {
  @ApiProperty({ enum: ['user', 'assistant'] }) role: 'user' | 'assistant';
  content: string;
  @ApiDateTime() at: string;
}

export class DailyCheckin implements Contract.DailyCheckin {
  @ApiUuid() id: string;
  /** Local date, YYYY-MM-DD. */
  @ApiProperty({ example: '2026-11-14' }) date: string;
  @ApiProperty({ enum: ['prompted', 'replied', 'completed', 'missed'] }) status: Contract.CheckinStatus;
  /** `light` after a missed check-in: no guilt, a softer ask. */
  @ApiProperty({ enum: ['normal', 'light'] }) tone: 'normal' | 'light';
  @ApiProperty({ type: [CompanionMessage] }) messages: CompanionMessage[];
  /** 1..5, set when the check-in wraps up. */
  @ApiInteger({ minimum: 1, maximum: 5 }) mood: number | null;
  @ApiInteger({ minimum: 1, maximum: 5 }) energy: number | null;
  wins: string[];
  summary: string | null;
  @ApiDateTime() completedAt: string | null;
}

export class CheckinReply implements Contract.CheckinReply {
  checkin: DailyCheckin;
  reply: string;
  /** True when the friend wrapped up (tomorrow's plan and what is still open are included). */
  done: boolean;
}

export class CompanionNudge implements Contract.CompanionNudge {
  @ApiUuid() id: string;
  text: string;
  @ApiProperty({ enum: ['scheduled', 'sent', 'dismissed', 'cancelled'] }) status: Contract.NudgeStatus;
  @ApiDateTime() sentAt: string | null;
  @ApiProperty({ type: [CompanionMessage] }) messages: CompanionMessage[];
}

export class NudgeReply implements Contract.NudgeReply {
  nudge: CompanionNudge;
  reply: string;
}

export class TodayCounts {
  @ApiInteger({ minimum: 0 }) meetings: number;
  @ApiInteger({ minimum: 0 }) reminders: number;
  @ApiInteger({ minimum: 0 }) openItems: number;
}

export class TodayCheckinState {
  /** Local check-in time, "HH:MM". */
  time: string;
  @ApiProperty({ enum: ['off', 'upcoming', 'due', 'prompted', 'replied', 'completed', 'missed'] })
  status: Contract.TodayCheckinStatus;
  @ApiInteger({ minimum: 1, maximum: 5 }) mood: number | null;
}

export class TodayBrief implements Contract.TodayBrief {
  @ApiProperty({ example: '2026-11-14' }) date: string;
  @ApiProperty({ enum: ['english', 'hinglish', 'mixed'] }) languageStyle: Contract.LanguageStyle;
  /** "Good morning, Asha" in the user's vibe. */
  greeting: string;
  /** One line about the day. */
  headline: string;
  counts: TodayCounts;
  @ApiProperty({ type: [MeetingListItem] }) meetings: MeetingListItem[];
  /** Today's reminders that still need the user (pending, or sent and not done). */
  @ApiProperty({ type: [Reminder] }) reminders: Reminder[];
  /** Open to-dos and promises, soonest due first. */
  @ApiProperty({ type: [ActionItem] }) openItems: ActionItem[];
  checkin: TodayCheckinState;
  /** Today's proactive nudge, once sent and until dismissed. */
  nudge: CompanionNudge | null;
}

export class MoodPoint implements Contract.MoodPoint {
  @ApiProperty({ example: '2026-11-14' }) date: string;
  @ApiInteger({ minimum: 1, maximum: 5 }) mood: number | null;
  @ApiInteger({ minimum: 1, maximum: 5 }) energy: number | null;
}

export class RecapHighlight {
  @ApiUuid() id: string;
  title: string;
  @ApiDateTime() startAt: string;
}

export class RecapMeetings {
  @ApiInteger({ minimum: 0 }) count: number;
  hours: number;
  @ApiProperty({ type: [RecapHighlight] }) highlights: RecapHighlight[];
}

export class RecapPromises {
  /** To-dos completed this week. */
  @ApiInteger({ minimum: 0 }) kept: number;
  @ApiInteger({ minimum: 0 }) remindersDone: number;
  @ApiInteger({ minimum: 0 }) stillOpen: number;
}

export class RecapMood {
  @ApiProperty({ type: [MoodPoint] }) days: MoodPoint[];
  average: number | null;
  @ApiProperty({ enum: ['up', 'down', 'flat'], nullable: true }) trend: 'up' | 'down' | 'flat' | null;
  @ApiInteger({ minimum: 0 }) checkins: number;
}

export class WeeklyRecap implements Contract.WeeklyRecap {
  @ApiProperty({ example: '2026-11-09' }) weekStart: string;
  @ApiProperty({ example: '2026-11-15' }) weekEnd: string;
  headline: string;
  meetings: RecapMeetings;
  promises: RecapPromises;
  mood: RecapMood;
  /** People from this week's meetings, most frequent first. */
  people: string[];
  @ApiDateTime() createdAt: string;
}
