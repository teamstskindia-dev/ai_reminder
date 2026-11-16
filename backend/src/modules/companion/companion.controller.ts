import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ThrottleByUser } from '../../common/decorators/metadata.decorators';
import { ApiDataResponse, ApiErrors } from '../../common/swagger/api-docs.decorators';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { CheckinService } from './checkin.service';
import {
  CheckinReply,
  CompanionNudge,
  CompanionTextDto,
  DailyCheckin,
  MoodPoint,
  MoodQueryDto,
  NudgeReply,
  RecapsQueryDto,
  TodayBrief,
  WeeklyRecap,
} from './companion.dto';
import { NudgeService } from './nudge.service';
import { RecapService } from './recap.service';
import { TodayService } from './today.service';

@ApiTags('companion')
@UserAuth()
@Controller()
export class CompanionController {
  constructor(
    private readonly today: TodayService,
    private readonly checkins: CheckinService,
    private readonly nudges: NudgeService,
    private readonly recaps: RecapService,
  ) {}

  @Get('today')
  @ApiOperation({
    summary: 'Get the Today screen',
    description:
      'Greeting and one-line brief in the user’s language style, today’s meetings (local day), reminders that ' +
      'still need the user, open to-dos, the evening check-in state and today’s nudge.',
  })
  @ApiDataResponse(TodayBrief)
  getToday(@CurrentUserId() userId: string) {
    return this.today.build(userId);
  }

  @Get('checkins/today')
  @ApiOperation({
    summary: 'Get (or start) today’s evening check-in',
    description: 'Creates today’s check-in with the friend’s opening message on first call. Safe to call any time.',
  })
  @ApiDataResponse(DailyCheckin)
  checkinToday(@CurrentUserId() userId: string) {
    return this.checkins.today(userId);
  }

  @Post('checkins/today/reply')
  @HttpCode(200)
  @ThrottleByUser()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Reply in today’s check-in',
    description:
      'The friend listens and reflects. After the third reply it wraps up on its own (`done: true`) with ' +
      'tomorrow’s plan and what is still open, and records mood and energy.',
  })
  @ApiDataResponse(CheckinReply)
  @ApiErrors('CONFLICT')
  checkinReply(@CurrentUserId() userId: string, @Body() dto: CompanionTextDto) {
    return this.checkins.reply(userId, dto.text);
  }

  @Post('checkins/today/finish')
  @HttpCode(200)
  @ThrottleByUser()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Wrap up today’s check-in now (needs at least one reply)' })
  @ApiDataResponse(CheckinReply)
  @ApiErrors('BAD_REQUEST')
  checkinFinish(@CurrentUserId() userId: string) {
    return this.checkins.finish(userId);
  }

  @Get('checkins/mood')
  @ApiOperation({ summary: 'Mood and energy per day (the mood timeline), oldest first' })
  @ApiDataResponse(MoodPoint, { isArray: true })
  mood(@CurrentUserId() userId: string, @Query() q: MoodQueryDto) {
    return this.checkins.mood(userId, q.days);
  }

  @Get('nudges/:id')
  @ApiOperation({ summary: 'Get a proactive nudge and its conversation' })
  @ApiDataResponse(CompanionNudge)
  @ApiErrors('NOT_FOUND')
  nudge(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.nudges.get(userId, id);
  }

  @Post('nudges/:id/reply')
  @HttpCode(200)
  @ThrottleByUser()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Reply to a proactive nudge' })
  @ApiDataResponse(NudgeReply)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  nudgeReply(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompanionTextDto) {
    return this.nudges.reply(userId, id, dto.text);
  }

  @Post('nudges/:id/dismiss')
  @HttpCode(204)
  @ApiOperation({ summary: 'Dismiss a nudge (hides it from Today; a scheduled one is not sent)' })
  @ApiNoContentResponse({ description: 'Dismissed.' })
  @ApiErrors('NOT_FOUND')
  async dismissNudge(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.nudges.dismiss(userId, id);
  }

  @Get('recaps')
  @ApiOperation({ summary: 'Weekly recaps, newest first (sent on Sunday evening)' })
  @ApiDataResponse(WeeklyRecap, { isArray: true })
  listRecaps(@CurrentUserId() userId: string, @Query() q: RecapsQueryDto) {
    return this.recaps.list(userId, q.limit);
  }
}
