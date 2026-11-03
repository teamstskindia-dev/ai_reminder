import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import type { AutoJoinMode, PlanLimits } from '../../common/types/api.types';
import { isJoinableMeetUrl } from '../../common/validation/safe-url';
import { isUniqueViolation } from '../../infra/prisma/prisma-errors';
import { removeJob, upsertJob } from '../../infra/queue/job-utils';
import { BotJoinJob, JOB, JobId, QUEUE } from '../../infra/queue/queue.constants';
import type { MeetingRow, UserSettingsRow } from '../../infra/prisma/models';
import { SettingsService } from '../content/settings.service';
import type { BotSettings } from '../content/settings.schemas';
import { MeetingEventsService } from '../meetings/meeting-events.service';
import { MeetingsRepository } from '../meetings/meetings.repository';
import { ReminderSchedulerService } from '../reminders/reminder-scheduler.service';
import { RemindersRepository } from '../reminders/reminders.repository';
import { DEFAULT_REMINDER_CHANNELS, RemindersService } from '../reminders/reminders.service';
import { UsersRepository } from '../users/users.repository';

export const PLAN_LIMIT_REASON = 'plan_limit';

interface ScheduleContext {
  userId: string;
  settings: UserSettingsRow;
  limits: PlanLimits;
  bot: BotSettings;
}

export function autoJoinAllows(mode: AutoJoinMode, isOrganizer: boolean): boolean {
  if (mode === 'all') return true;
  if (mode === 'owned') return isOrganizer;
  return false;
}

/** UTC calendar month [start, end) containing `date` (plan limits are counted per UTC month). */
export function monthWindow(date: Date): [Date, Date] {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return [start, end];
}

/**
 * Decides, per meeting, whether the bot should join (delayed `meeting-bot` job `bot-{id}`) and keeps the
 * single "meeting starts soon" reminder in sync. Used by calendar sync (worker) and meeting/settings
 * changes (api). Idempotent: running it twice changes nothing.
 */
@Injectable()
export class MeetingSchedulerService {
  private readonly logger = new Logger(MeetingSchedulerService.name);

  constructor(
    @InjectQueue(QUEUE.MEETING_BOT) private readonly botQueue: Queue,
    private readonly meetings: MeetingsRepository,
    private readonly events: MeetingEventsService,
    private readonly users: UsersRepository,
    private readonly reminders: RemindersRepository,
    private readonly remindersService: RemindersService,
    private readonly reminderScheduler: ReminderSchedulerService,
    private readonly settings: SettingsService,
  ) {}

  async rescheduleUser(userId: string): Promise<void> {
    await this.scheduleMeetings(userId, await this.meetings.schedulable(userId));
  }

  async scheduleMeetings(userId: string, meetings: MeetingRow[]): Promise<void> {
    if (!meetings.length) return;
    const ctx = await this.context(userId);
    const sorted = [...meetings].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    for (const meeting of sorted) {
      try {
        const updated = await this.scheduleBot(meeting, ctx);
        await this.syncUpcomingReminder(updated, ctx);
      } catch (err) {
        this.logger.error(`Scheduling meeting ${meeting.id} failed: ${(err as Error).message}`);
      }
    }
  }

  async scheduleMeeting(meeting: MeetingRow): Promise<MeetingRow> {
    const ctx = await this.context(meeting.userId);
    const updated = await this.scheduleBot(meeting, ctx);
    await this.syncUpcomingReminder(updated, ctx);
    return updated;
  }

  /** Stops everything scheduled for a meeting (bot job + pending "starts soon" reminder). */
  async unscheduleMeeting(meeting: Pick<MeetingRow, 'id' | 'botJobId'>): Promise<void> {
    await removeJob(this.botQueue, JobId.bot(meeting.id));
    const upcoming = await this.reminders.findMeetingUpcoming(meeting.id);
    if (upcoming?.status === 'pending') await this.remindersService.cancelMany([upcoming]);
  }

  /** Sends the bot right away (POST /meetings/:id/bot/join). Enforces the monthly plan limit. */
  async joinNow(meeting: MeetingRow): Promise<MeetingRow> {
    const ctx = await this.context(meeting.userId);
    await this.assertWithinPlan(meeting, ctx);
    const jobId = JobId.bot(meeting.id);
    await upsertJob<BotJoinJob>(this.botQueue, JOB.BOT_JOIN, { meetingId: meeting.id }, { jobId, delay: 0 });
    return this.events.setStatus(meeting.id, 'scheduled', {
      botJobId: jobId,
      failureReason: null,
      autoJoin: true,
    });
  }

  private async context(userId: string): Promise<ScheduleContext> {
    const [settings, limits, bot] = await Promise.all([
      this.users.getSettings(userId),
      this.users.planLimits(userId),
      this.settings.get('bot'),
    ]);
    return { userId, settings, limits, bot };
  }

  private async assertWithinPlan(meeting: MeetingRow, ctx: ScheduleContext): Promise<void> {
    const limit = ctx.limits.meetingsPerMonth;
    if (limit === null) return;
    const [from, to] = monthWindow(meeting.startAt);
    const used = await this.meetings.countTowardsPlan(ctx.userId, from, to, meeting.id);
    if (used >= limit) {
      throw AppException.planLimit(
        `Your plan allows ${limit} recorded meetings per month. Upgrade your plan to record more.`,
      );
    }
  }

  private async scheduleBot(meeting: MeetingRow, ctx: ScheduleContext): Promise<MeetingRow> {
    const now = Date.now();
    const start = meeting.startAt.getTime();
    const end = meeting.endAt ? meeting.endAt.getTime() : start + 60 * 60_000;
    const jobId = JobId.bot(meeting.id);
    const reEvaluable =
      meeting.status === 'scheduled' || (meeting.status === 'skipped' && meeting.failureReason === PLAN_LIMIT_REASON);
    if (!reEvaluable) return meeting;

    const wantsBot =
      meeting.platform === 'google_meet' &&
      isJoinableMeetUrl(meeting.meetingUrl) &&
      meeting.autoJoin &&
      autoJoinAllows(ctx.settings.autoJoin as AutoJoinMode, meeting.isOrganizer) &&
      end > now;

    if (!wantsBot) {
      if (meeting.botJobId) await removeJob(this.botQueue, jobId);
      if (meeting.botJobId || meeting.status === 'skipped') {
        const patch = { botJobId: null };
        if (meeting.status === 'skipped')
          return this.events.setStatus(meeting.id, 'scheduled', { ...patch, failureReason: null });
        return this.meetings.update(meeting.id, patch);
      }
      return meeting;
    }

    if (ctx.limits.meetingsPerMonth !== null) {
      const [from, to] = monthWindow(new Date(start));
      const used = await this.meetings.countTowardsPlan(ctx.userId, from, to, meeting.id);
      if (used >= ctx.limits.meetingsPerMonth) {
        await removeJob(this.botQueue, jobId);
        if (meeting.status === 'skipped' && !meeting.botJobId) return meeting;
        return this.events.setStatus(meeting.id, 'skipped', { failureReason: PLAN_LIMIT_REASON, botJobId: null });
      }
    }

    const runAt = Math.max(now, start - ctx.bot.joinBeforeMinutes * 60_000);
    await upsertJob<BotJoinJob>(this.botQueue, JOB.BOT_JOIN, { meetingId: meeting.id }, { jobId, delay: runAt - now });
    if (meeting.status === 'skipped') {
      return this.events.setStatus(meeting.id, 'scheduled', { botJobId: jobId, failureReason: null });
    }
    if (meeting.botJobId !== jobId) return this.meetings.update(meeting.id, { botJobId: jobId });
    return meeting;
  }

  private async syncUpcomingReminder(meeting: MeetingRow, ctx: ScheduleContext): Promise<void> {
    const minutes = ctx.settings.meetingReminderMinutes;
    const remindAt = new Date(meeting.startAt.getTime() - minutes * 60_000);
    const shouldExist =
      (meeting.status === 'scheduled' || meeting.status === 'skipped') &&
      minutes > 0 &&
      remindAt.getTime() > Date.now();
    const existing = await this.reminders.findMeetingUpcoming(meeting.id);

    if (!shouldExist) {
      if (existing?.status === 'pending') await this.remindersService.cancelMany([existing]);
      return;
    }

    if (existing) {
      const sameTime = existing.remindAt.getTime() === remindAt.getTime();
      if (sameTime && existing.status === 'sent') return;
      if (sameTime && existing.status === 'pending' && existing.title === meeting.title) {
        await this.reminderScheduler.schedule(existing);
        return;
      }
      const updated = await this.reminders.update(existing.id, {
        title: meeting.title,
        remindAt,
        status: 'pending',
        sentAt: null,
        failureReason: null,
      });
      await this.reminderScheduler.schedule(updated);
      return;
    }

    try {
      await this.remindersService.createAndSchedule({
        userId: meeting.userId,
        meetingId: meeting.id,
        type: 'meeting_upcoming',
        source: 'system',
        title: meeting.title,
        body: null,
        remindAt,
        channels: DEFAULT_REMINDER_CHANNELS,
      });
    } catch (err) {
      // Unique index (one meeting_upcoming per meeting) → a concurrent run already created it.
      if (!isUniqueViolation(err)) throw err;
    }
  }
}
