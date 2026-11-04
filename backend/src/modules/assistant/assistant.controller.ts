import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ThrottleByUser } from '../../common/decorators/metadata.decorators';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { ApiDataResponse, ApiErrors, ApiPaginatedResponse } from '../../common/swagger/api-docs.decorators';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { AskDto, AskResult, AssistantMessage, AssistantThread } from './assistant.dto';
import { AssistantService } from './assistant.service';

@ApiTags('assistant')
@UserAuth()
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('ask')
  @HttpCode(200)
  @ThrottleByUser()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Ask a question about your meetings',
    description:
      'Answers from your meeting transcripts and cites the excerpts used. Counts towards the daily Ask AI quota ' +
      'of your plan. Rate limit: 20 requests per minute per user.',
  })
  @ApiDataResponse(AskResult)
  @ApiErrors('FORBIDDEN', 'NOT_FOUND', 'PLAN_LIMIT_REACHED', 'UPSTREAM_ERROR')
  ask(@CurrentUserId() userId: string, @Body() dto: AskDto) {
    return this.assistant.ask(userId, dto);
  }

  @Get('threads')
  @ApiOperation({ summary: 'List conversation threads, most recent first' })
  @ApiPaginatedResponse(AssistantThread)
  threads(@CurrentUserId() userId: string, @Query() q: PaginationQueryDto) {
    return this.assistant.listThreads(userId, q.page, q.limit);
  }

  @Get('threads/:id/messages')
  @ApiOperation({ summary: 'Get all messages of a thread, oldest first' })
  @ApiDataResponse(AssistantMessage, { isArray: true })
  @ApiErrors('NOT_FOUND')
  messages(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.assistant.messages(userId, id);
  }

  @Delete('threads/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a thread and its messages' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async remove(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.assistant.deleteThread(userId, id);
  }
}
