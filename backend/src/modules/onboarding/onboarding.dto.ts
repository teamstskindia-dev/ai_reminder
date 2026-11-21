import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsString, Length, MaxLength, ValidateNested } from 'class-validator';
import { IsOptionalNonNull, IsOptionalNullable } from '../../common/validation/validators';
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
  /** 1 polite and curious, 2 casual, 3 close friend. Grows with warmth (updated nightly). */
  @ApiInteger({ minimum: 1, maximum: 3 }) relationshipStage: number;
  @ApiDateTime() updatedAt: string | null;
}

export class TranscriptionResult {
  /** What the user said (Hindi words in Latin script). Empty when no speech was found. */
  text: string;
}

/** "What I know about you" (§10): edit, correct or delete any item. Omitted fields stay as they are. */
export class UpdateProfileDto {
  @IsOptionalNullable()
  @IsString()
  @Length(1, 80)
  preferredName?: string | null;

  @IsOptionalNullable()
  @IsString()
  @Length(1, 200)
  occupation?: string | null;

  @IsOptionalNullable()
  @IsString()
  @Length(1, 300)
  currentFocus?: string | null;

  /** How the user likes to be talked to. */
  @IsOptionalNullable()
  @IsString()
  @Length(1, 200)
  communicationStyle?: string | null;

  /** The friend's tone with the user, e.g. "warm", "playful", "straight-talking", "calm". */
  @IsOptionalNullable()
  @IsString()
  @Length(1, 40)
  tone?: string | null;

  @ApiProperty({ enum: ['english', 'hinglish', 'mixed'], required: false })
  @IsOptionalNonNull()
  @IsIn(['english', 'hinglish', 'mixed'])
  languageStyle?: Contract.LanguageStyle;

  /** The full list of facts (replaces the stored list). */
  @IsOptionalNonNull()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  facts?: string[];
}
