import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ThrottleByUser } from '../../common/decorators/metadata.decorators';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { ApiDataResponse, ApiErrors, ApiPaginatedResponse } from '../../common/swagger/api-docs.decorators';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import {
  TalkActionRefDto,
  TalkActionStatusDto,
  TalkEmailSent,
  TalkMessage,
  TalkNoteDto,
  TalkReply,
  TalkScheduled,
  TalkScheduleDto,
  TalkSendDto,
  TalkSendEmailDto,
  TalkTaskDto,
  TalkThread,
} from './talk.dto';
import { TalkService } from './talk.service';

@ApiTags('talk')
@UserAuth()
@Controller('talk')
export class TalkController {
  constructor(private readonly talk: TalkService) {}

  @Post('messages')
  @HttpCode(200)
  @ThrottleByUser()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Talk with your friend',
    description:
      "The friend answers in the user's style, grounded in memory (cited in `sources`). It sets reminders right " +
      'away and proposes meetings and emails for approval (`actions`). `incognito: true` saves and learns nothing ' +
      '(send `history` yourself). Shares the daily AI quota with Ask AI. 20 messages per minute.',
  })
  @ApiDataResponse(TalkReply)
  @ApiErrors('NOT_FOUND', 'PLAN_LIMIT_REACHED')
  send(@CurrentUserId() userId: string, @Body() dto: TalkSendDto) {
    return this.talk.send(userId, dto);
  }

  @Post('schedule')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Schedule an approved meeting',
    description:
      'Creates the event in Google Calendar and Google emails the invites. Only call after the user approved the ' +
      'preview. Needs Google Calendar connected with permission to add events.',
  })
  @ApiDataResponse(TalkScheduled)
  @ApiErrors('CONFLICT', 'NOT_FOUND')
  schedule(@CurrentUserId() userId: string, @Body() dto: TalkScheduleDto) {
    return this.talk.schedule(userId, dto);
  }

  @Post('actions/status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a drafted email as sent, or cancel a proposal' })
  @ApiDataResponse(TalkMessage)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  actionStatus(@CurrentUserId() userId: string, @Body() dto: TalkActionStatusDto) {
    return this.talk.setActionStatus(userId, dto.messageId, dto.actionId, dto.status);
  }

  @Post('actions/email')
  @HttpCode(200)
  @ThrottleByUser()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Send an approved email from the connected account',
    description:
      'Only after the user approved the draft. Sends from their own Gmail / Outlook (threaded when `replyToEmailId` ' +
      'is set). Fails with CONFLICT when no account can send (read-only, not connected or needs a reconnect).',
  })
  @ApiDataResponse(TalkEmailSent)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  async sendEmail(@CurrentUserId() userId: string, @Body() dto: TalkSendEmailDto) {
    return { message: await this.talk.sendEmail(userId, dto) };
  }

  @Post('actions/task')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send a prepared task to its tool',
    description:
      '`send` creates it; after a duplicate warning, `merge` links to the existing task and `new` creates anyway.',
  })
  @ApiDataResponse(TalkMessage)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  sendTask(@CurrentUserId() userId: string, @Body() dto: TalkTaskDto) {
    return this.talk.sendTask(userId, dto.messageId, dto.actionId, dto.mode);
  }

  @Post('actions/note')
  @HttpCode(200)
  @ApiOperation({ summary: 'Save an approved note to Notion' })
  @ApiDataResponse(TalkMessage)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  saveNote(@CurrentUserId() userId: string, @Body() dto: TalkNoteDto) {
    return this.talk.saveNote(userId, dto.messageId, dto.actionId, { title: dto.title, body: dto.body });
  }

  @Post('actions/retry')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Retry a meeting that waited for Google Calendar',
    description: 'After the user connected (or reconnected) the calendar, turns the card into the invite preview.',
  })
  @ApiDataResponse(TalkMessage)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  retryAction(@CurrentUserId() userId: string, @Body() dto: TalkActionRefDto) {
    return this.talk.retryAction(userId, dto.messageId, dto.actionId);
  }

  @Get('threads')
  @ApiOperation({ summary: 'List Talk conversations, most recent first' })
  @ApiPaginatedResponse(TalkThread)
  threads(@CurrentUserId() userId: string, @Query() q: PaginationQueryDto) {
    return this.talk.threads(userId, q.page, q.limit);
  }

  @Get('threads/:id/messages')
  @ApiOperation({ summary: 'All messages of a Talk conversation, oldest first' })
  @ApiDataResponse(TalkMessage, { isArray: true })
  @ApiErrors('NOT_FOUND')
  messages(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.talk.messages(userId, id);
  }

  @Delete('threads/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a Talk conversation' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async remove(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.talk.deleteThread(userId, id);
  }
}
