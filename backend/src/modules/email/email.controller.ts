import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ThrottleByUser } from '../../common/decorators/metadata.decorators';
import { ApiDataResponse, ApiErrors, ApiPaginatedResponse } from '../../common/swagger/api-docs.decorators';
import { QueuedResult } from '../../common/swagger/common-results.dto';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import {
  EmailDetail,
  EmailDetectedActionDto,
  EmailDraftDto,
  EmailFeedbackDto,
  EmailItem,
  EmailRemindDto,
  EmailReplyDraft,
  EmailSendDto,
  EmailStatusDto,
  ListEmailsQueryDto,
} from './email.dto';
import { EmailService } from './email.service';

@ApiTags('emails')
@UserAuth()
@Controller('emails')
export class EmailController {
  constructor(private readonly emails: EmailService) {}

  @Get()
  @ApiOperation({
    summary: 'Emails the friend read, newest first',
    description: 'Only what was kept: sender, subject, a one-line summary, why it matters and the category. No bodies.',
  })
  @ApiPaginatedResponse(EmailItem)
  list(@CurrentUserId() userId: string, @Query() q: ListEmailsQueryDto) {
    return this.emails.list(userId, q.filter ?? 'all', q.page, q.limit);
  }

  @Post('sync')
  @HttpCode(200)
  // Each run calls the mail provider and AI triage; the queue only de-duplicates while a run is pending.
  @ThrottleByUser()
  @Throttle({ default: { limit: 6, ttl: 600_000 } })
  @ApiOperation({ summary: 'Check the inbox now', description: 'At most 6 per user per 10 minutes.' })
  @ApiDataResponse(QueuedResult)
  @ApiErrors('CONFLICT')
  sync(@CurrentUserId() userId: string) {
    return this.emails.syncNow(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One email: summary, why it matters and the deadlines it mentions' })
  @ApiDataResponse(EmailDetail)
  @ApiErrors('NOT_FOUND')
  get(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.emails.get(userId, id);
  }

  @Post(':id/feedback')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Not important / always alert me',
    description: 'Teaches the friend which senders matter: muted senders never alert, VIPs break through quiet hours.',
  })
  @ApiDataResponse(EmailDetail)
  @ApiErrors('NOT_FOUND')
  feedback(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EmailFeedbackDto) {
    return this.emails.feedback(userId, id, dto.kind);
  }

  @Post(':id/status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark handled (done) or bring it back' })
  @ApiDataResponse(EmailDetail)
  @ApiErrors('NOT_FOUND')
  status(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EmailStatusDto) {
    return this.emails.setStatus(userId, id, dto.status);
  }

  @Post(':id/remind')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remind me later about this email' })
  @ApiDataResponse(EmailDetail)
  @ApiErrors('NOT_FOUND')
  remind(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EmailRemindDto) {
    return this.emails.remind(userId, id, new Date(dto.remindAt), dto.title);
  }

  @Post(':id/detected/:detectedId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Confirm a deadline, bill, booking or trip the email mentions',
    description: 'As a reminder (default a day before it is due) or a Google Calendar event, or dismiss it.',
  })
  @ApiDataResponse(EmailDetail)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  detected(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('detectedId', ParseUUIDPipe) detectedId: string,
    @Body() dto: EmailDetectedActionDto,
  ) {
    return this.emails.resolveDetected(
      userId,
      id,
      detectedId,
      dto.action,
      dto.remindAt ? new Date(dto.remindAt) : undefined,
    );
  }

  @Post(':id/reply-draft')
  @HttpCode(200)
  @ThrottleByUser()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Draft a reply in my style',
    description: 'Reads the email live (it is never stored) and drafts a reply. Nothing is sent.',
  })
  @ApiDataResponse(EmailReplyDraft)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  draft(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EmailDraftDto) {
    return this.emails.draftReply(userId, id, dto.instructions);
  }

  @Post(':id/reply')
  @HttpCode(200)
  @ThrottleByUser()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Send the reply the user approved',
    description:
      'Sends from the user’s own Gmail / Outlook, in the same thread. Needs the account connected with sending allowed.',
  })
  @ApiDataResponse(EmailDetail)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  reply(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EmailSendDto) {
    return this.emails.sendReply(userId, id, dto);
  }
}
