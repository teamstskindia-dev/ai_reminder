import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { ThrottleByUser } from '../../common/decorators/metadata.decorators';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { AssistantService } from './assistant.service';

export class AskDto {
  @IsString()
  @Length(1, 2000)
  question: string;

  @IsOptional()
  @IsUUID()
  threadId?: string;

  @IsOptional()
  @IsUUID()
  meetingId?: string;
}

@ApiTags('assistant')
@UserAuth()
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('ask')
  @HttpCode(200)
  @ThrottleByUser()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  ask(@CurrentUserId() userId: string, @Body() dto: AskDto) {
    return this.assistant.ask(userId, dto);
  }

  @Get('threads')
  threads(@CurrentUserId() userId: string, @Query() q: PaginationQueryDto) {
    return this.assistant.listThreads(userId, q.page, q.limit);
  }

  @Get('threads/:id/messages')
  messages(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.assistant.messages(userId, id);
  }

  @Delete('threads/:id')
  @HttpCode(204)
  async remove(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.assistant.deleteThread(userId, id);
  }
}
