import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiDateTime, ApiUuid } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';
import { AssistantSource } from '../assistant/assistant.dto';

// ---------- requests ----------
export class TalkHistoryItemDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  content: string;
}

export class TalkSendDto {
  @ApiProperty({ minLength: 1, maxLength: 2000, example: 'Kal Rahul ke saath meeting kaisi rahi thi?' })
  @IsString()
  @Length(1, 2000)
  text: string;

  /** Continue a conversation; omit to start a new one. */
  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  threadId?: string;

  /** Incognito: nothing is saved and nothing is learned. The app sends the recent history itself. */
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  incognito?: boolean;

  @ApiProperty({ required: false, type: [TalkHistoryItemDto], description: 'Incognito only: the last messages.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TalkHistoryItemDto)
  history?: TalkHistoryItemDto[];
}

export class TalkAttendeeDto {
  @ApiProperty({ required: false, nullable: true, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string | null;

  @ApiProperty({ maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  email: string;
}

/** The user approved a meeting proposal (possibly after editing the time, title or guests). */
export class TalkScheduleDto {
  @ApiProperty({ required: false, format: 'uuid', description: 'The message holding the proposal (not incognito).' })
  @IsOptional()
  @IsUUID()
  messageId?: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actionId?: string;

  @ApiProperty({ maxLength: 300 })
  @IsString()
  @Length(1, 300)
  title: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  startAt: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  endAt: string;

  @ApiProperty({ type: [TalkAttendeeDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TalkAttendeeDto)
  attendees: TalkAttendeeDto[];
}

export class TalkActionStatusDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  messageId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  actionId: string;

  /** `sent`: the user sent the drafted email from their mail app. `cancelled`: they dropped the proposal. */
  @ApiProperty({ enum: ['sent', 'cancelled'] })
  @IsIn(['sent', 'cancelled'])
  status: 'sent' | 'cancelled';
}

// ---------- responses ----------
export class TalkMessage implements Contract.TalkMessage {
  @ApiUuid() id: string;
  @ApiProperty({ enum: ['user', 'assistant'] }) role: 'user' | 'assistant';
  content: string;
  @ApiProperty({ type: [AssistantSource] }) sources: AssistantSource[];
  /**
   * Action cards: \`reminder\` (set), \`meeting\` (proposal → approve with POST /talk/schedule), \`email\`
   * (draft → the app opens the user's mail app), \`task\` (added), \`unavailable\` (an app that is not connected).
   */
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  actions: Contract.TalkAction[];
  @ApiProperty({ enum: ['vent', 'advice', 'recall', 'task', 'chat'], nullable: true })
  intent: Contract.TalkIntent | null;
  /** The friend saw signs of crisis: the app shows helpline resources. */
  crisis: boolean;
  @ApiDateTime() createdAt: string;
}

export class TalkReply implements Contract.TalkReply {
  @ApiUuid('null for an incognito chat.') threadId: string | null;
  userMessage: TalkMessage;
  reply: TalkMessage;
}

export class TalkThread {
  @ApiUuid() id: string;
  title: string;
  @ApiDateTime() createdAt: string;
  @ApiDateTime() updatedAt: string;
}

export class TalkScheduled {
  /** Google Calendar event id. */
  eventId: string;
  htmlLink: string | null;
  @ApiProperty({ type: TalkMessage, nullable: true }) message: TalkMessage | null;
}
