import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsString, Length, ValidateNested } from 'class-validator';
import { ApiDateTime, ApiInteger } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';

export class OnboardingChatMessageDto implements Contract.OnboardingChatMessage {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty({ example: 'Call me Vij' })
  @IsString()
  @Length(1, 1000)
  content: string;
}

export class OnboardingChatDto {
  /** The conversation so far, oldest first (empty to get the opening message). */
  @ApiProperty({ type: [OnboardingChatMessageDto], maxItems: 12 })
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => OnboardingChatMessageDto)
  messages: OnboardingChatMessageDto[];
}

// ---------- responses ----------

export class OnboardingChatReply implements Contract.OnboardingChatReply {
  /** The friend's next message. */
  reply: string;
  /** 0-based index of the question the reply asks; equals `totalSteps` once the chat is complete. */
  @ApiInteger({ minimum: 0 }) step: number;
  @ApiInteger({ minimum: 1 }) totalSteps: number;
  /** True when the chat is complete; call `POST /onboarding/profile` next. */
  done: boolean;
  /** How the user writes, so the app can mirror it. */
  @ApiProperty({ enum: ['english', 'hinglish', 'mixed'] })
  languageStyle: Contract.LanguageStyle;
}

export class UserProfile implements Contract.UserProfile {
  /** `pending` until the get-to-know-you chat finishes; `skipped` if the user skipped it. */
  @ApiProperty({ enum: ['pending', 'completed', 'skipped'] })
  status: Contract.ProfileStatus;
  preferredName: string | null;
  occupation: string | null;
  currentFocus: string | null;
  /** How the user likes to be talked to, e.g. "casual and funny". */
  communicationStyle: string | null;
  @ApiProperty({ enum: ['english', 'hinglish', 'mixed'] })
  languageStyle: Contract.LanguageStyle;
  /** The vibe to use with the user, e.g. "playful". */
  tone: string | null;
  /** Short facts the user shared about themselves. */
  facts: string[];
  summary: string | null;
  @ApiDateTime() updatedAt: string | null;
}

export class TranscriptionResult {
  /** What the user said (Hindi words in Latin script). Empty when no speech was found. */
  text: string;
}
