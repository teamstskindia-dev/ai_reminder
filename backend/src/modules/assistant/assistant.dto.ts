import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { ApiDateTime, ApiUuid } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';

export class AskDto {
  @ApiProperty({ example: 'What did we decide about the launch date?' })
  @IsString()
  @Length(1, 2000)
  question: string;

  /** Continue an existing conversation; omit to start a new thread. */
  @IsOptional()
  @IsUUID()
  threadId?: string;

  /** Only search this meeting; omit to search all meetings. */
  @IsOptional()
  @IsUUID()
  meetingId?: string;
}

// ---------- responses ----------

export class AssistantSource implements Contract.AssistantSource {
  @ApiUuid() meetingId: string;
  meetingTitle: string;
  @ApiDateTime() startAt: string;
  /** Transcript excerpt the answer is based on. */
  snippet: string;
  /** Cosine similarity between the excerpt and the question (higher is closer). */
  similarity: number;
}

export class AssistantThread implements Contract.AssistantThread {
  @ApiUuid() id: string;
  title: string;
  @ApiDateTime() createdAt: string;
  @ApiDateTime() updatedAt: string;
}

export class AssistantMessage implements Contract.AssistantMessage {
  @ApiUuid() id: string;
  @ApiUuid() threadId: string;
  role: 'user' | 'assistant';
  /** Markdown. */
  content: string;
  sources: AssistantSource[];
  @ApiDateTime() createdAt: string;
}

export class AskResult {
  @ApiUuid() threadId: string;
  /** The assistant answer. */
  message: AssistantMessage;
}
