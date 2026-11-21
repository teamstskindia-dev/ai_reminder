import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiInteger } from '../../../common/swagger/api-docs.decorators';
import { IsDateTime, IsOptionalNonNull, IsOptionalNullable, IsTimeZone } from '../../../common/validation/validators';

/** 24h local time, e.g. 07:30. */
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Asha Rao' })
  @IsOptionalNonNull()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptionalNonNull()
  @IsTimeZone()
  timezone?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptionalNonNull()
  @Matches(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, { message: 'locale must be a BCP-47 tag like "en" or "en-IN"' })
  locale?: string;

  @ApiPropertyOptional({ enum: [true] })
  @IsOptionalNonNull()
  @IsIn([true], { message: 'onboarded can only be set to true' })
  onboarded?: true;
}

export class UpdateUserSettingsDto {
  @ApiPropertyOptional({ enum: ['all', 'owned', 'none'] })
  @IsOptionalNonNull()
  @IsIn(['all', 'owned', 'none'])
  autoJoin?: 'all' | 'owned' | 'none';

  @ApiPropertyOptional({ nullable: true, description: 'null → global bot name' })
  @IsOptionalNullable()
  @IsString()
  @Length(1, 60)
  botName?: string | null;

  /** Minutes before a meeting to send the reminder (0 = off). */
  @ApiInteger()
  @IsOptionalNonNull()
  @IsInt()
  @Min(0)
  @Max(1440)
  meetingReminderMinutes?: number;

  @IsOptionalNonNull()
  @IsBoolean()
  dailyDigest?: boolean;

  /** Local hour (user time zone) for the daily digest. */
  @ApiInteger()
  @IsOptionalNonNull()
  @IsInt()
  @Min(0)
  @Max(23)
  digestHour?: number;

  @IsOptionalNonNull()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptionalNonNull()
  @IsBoolean()
  pushNotifications?: boolean;

  /** Local wake time, "HH:MM" (24h). The morning brief and daily digest follow it. */
  @ApiPropertyOptional({ example: '07:30', pattern: HHMM.source })
  @IsOptionalNonNull()
  @Matches(HHMM, { message: 'wakeTime must be "HH:MM" (24h)' })
  wakeTime?: string;

  @ApiPropertyOptional({ example: '22:30', pattern: HHMM.source })
  @IsOptionalNonNull()
  @Matches(HHMM, { message: 'quietHoursStart must be "HH:MM" (24h)' })
  quietHoursStart?: string;

  @ApiPropertyOptional({ example: '07:00', pattern: HHMM.source })
  @IsOptionalNonNull()
  @Matches(HHMM, { message: 'quietHoursEnd must be "HH:MM" (24h)' })
  quietHoursEnd?: string;

  /** Local time of the evening check-in, "HH:MM" (24h). */
  @ApiPropertyOptional({ example: '21:00', pattern: HHMM.source })
  @IsOptionalNonNull()
  @Matches(HHMM, { message: 'checkinTime must be "HH:MM" (24h)' })
  checkinTime?: string;

  /** Push the morning brief at wake time. */
  @IsOptionalNonNull()
  @IsBoolean()
  morningBrief?: boolean;

  /** Ask "how did today go?" at check-in time. */
  @IsOptionalNonNull()
  @IsBoolean()
  eveningCheckin?: boolean;

  /** `true` records that the user saw the one-time "let people know when you record" note. */
  @ApiPropertyOptional({ enum: [true] })
  @IsOptionalNonNull()
  @IsIn([true], { message: 'recordingConsentAcknowledged can only be set to true' })
  recordingConsentAcknowledged?: true;

  /** Push important emails (user-flow §07). */
  @IsOptionalNonNull()
  @IsBoolean()
  emailAlerts?: boolean;

  /** Senders that always alert (emails). Replaces the list. */
  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsOptionalNonNull()
  @IsArray()
  @ArrayMaxSize(100)
  @IsEmail({}, { each: true })
  vipSenders?: string[];

  /** Senders that never alert (emails). Replaces the list. */
  @ApiPropertyOptional({ type: [String], maxItems: 500 })
  @IsOptionalNonNull()
  @IsArray()
  @ArrayMaxSize(500)
  @IsEmail({}, { each: true })
  mutedSenders?: string[];

  /** Normal pushes per local day before the rest are bundled into one (user-flow §09). */
  @ApiInteger({ minimum: 1, maximum: 50 })
  @IsOptionalNonNull()
  @IsInt()
  @Min(1)
  @Max(50)
  pushBudget?: number;

  /** Critical alerts may break through quiet hours and focus mode. */
  @IsOptionalNonNull()
  @IsBoolean()
  criticalBreakThrough?: boolean;

  /** Focus mode until this time; `null` turns it off. At most 24 hours ahead. */
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptionalNullable()
  @IsDateTime()
  focusUntil?: string | null;

  /** "Take a break" from nudges until this time; `null` resumes them. At most 30 days ahead. */
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptionalNullable()
  @IsDateTime()
  nudgesPausedUntil?: string | null;

  /** Privacy: keep memories but learn nothing new about the user (facts, profile, mood, timing). */
  @IsOptionalNonNull()
  @IsBoolean()
  learningPaused?: boolean;
}
