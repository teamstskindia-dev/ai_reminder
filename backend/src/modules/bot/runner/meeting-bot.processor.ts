import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Inject, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../../config/app-config';
import { causeChain } from '../../../common/errors/app.exception';
import { isJoinableMeetUrl, normalizeMeetUrl } from '../../../common/validation/safe-url';
import type { MeetingRow } from '../../../infra/prisma/models';
import { BaseProcessor, PermanentJobError } from '../../../infra/queue/base.processor';
import { upsertJob } from '../../../infra/queue/job-utils';
import { AiProcessJob, BotJoinJob, JOB, JobId, QUEUE } from '../../../infra/queue/queue.constants';
import { REDIS, RedisKeys } from '../../../infra/redis/redis.constants';
import type { BotSettings } from '../../content/settings.schemas';
import { SettingsService } from '../../content/settings.service';
import { MeetingEventsService } from '../../meetings/meeting-events.service';
import { MeetingsRepository, TranscriptRepository } from '../../meetings/meetings.repository';
import { NotificationProducer } from '../../notifications/notification-producer.service';
import { UsersRepository } from '../../users/users.repository';
import { RecallDispatcher } from '../recall/recall-dispatcher.service';
import { BotSession, SessionOutcome } from './bot-session';
import { failureReasonFrom, formatFailureReason } from './bot-step-error';
import { MeetRunner } from './meet-runner';
import { SimulateRunner } from './simulate-runner';

const SHUTDOWN_GRACE_MS = 45_000;
const LIVE_STATUSES = ['joining', 'waiting_room', 'in_progress'];
const MAX_TRACKED_NOTIFICATIONS = 1000;

/**
 * `meeting-bot` consumer (bot process only). One job = one meeting: claims the meeting
 * (scheduled → joining), then either hands it to Recall.ai (provider `recall`: create the bot and
 * return; webhooks drive the rest) or runs the Puppeteer/simulated runner and finalises the session
 * (processing + AI job, or failed + one `bot_failed` notification).
 */
@Processor(QUEUE.MEETING_BOT)
export class MeetingBotProcessor extends BaseProcessor<BotJoinJob> implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly active = new Map<string, { session: BotSession; done: Promise<void> }>();
  /** Meetings for which a `bot_failed` notification was already sent (guards onFinalFailure). */
  private readonly notifiedFailures = new Set<string>();

  constructor(
    private readonly config: AppConfig,
    private readonly meetings: MeetingsRepository,
    private readonly transcripts: TranscriptRepository,
    private readonly events: MeetingEventsService,
    private readonly users: UsersRepository,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationProducer,
    private readonly meetRunner: MeetRunner,
    private readonly simulateRunner: SimulateRunner,
    private readonly recall: RecallDispatcher,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(QUEUE.AI) private readonly aiQueue: Queue,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.bot.concurrency;
    this.logger.log({ mode: this.config.bot.mode, concurrency: this.config.bot.concurrency }, 'meeting bot ready');
  }

  protected async handle(job: Job<BotJoinJob>): Promise<string> {
    const { meetingId } = job.data;
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting) throw new PermanentJobError('meeting no longer exists');

    if (LIVE_STATUSES.includes(meeting.status) && meeting.botProvider === 'recall') {
      return 'skipped: a Recall.ai bot is handling this meeting';
    }
    if (LIVE_STATUSES.includes(meeting.status) && !this.active.has(meeting.id)) {
      // The bot process that owned this meeting died (stalled job re-delivered): no automatic re-join.
      return this.recoverOrphan(meeting);
    }
    if (meeting.status !== 'scheduled') return `skipped: status ${meeting.status}`;
    if (meeting.platform !== 'google_meet') throw new PermanentJobError('meeting is not a Google Meet meeting');
    if (!isJoinableMeetUrl(meeting.meetingUrl)) {
      const reason = formatFailureReason('navigate', 'invalid Google Meet URL');
      await this.failMeeting(meeting, reason);
      throw new PermanentJobError(reason);
    }
    if (meeting.endAt && meeting.endAt.getTime() < Date.now() - 60_000) {
      await this.failMeeting(meeting, formatFailureReason('join', 'meeting already ended'), false);
      return 'skipped: meeting already ended';
    }

    const bot = await this.settings.get('bot');
    const claimed = await this.meetings.updateIfStatus(meeting.id, ['scheduled'], {
      status: 'joining',
      failureReason: null,
      botProvider: bot.provider,
      // A re-join detaches any earlier provider bot: its late webhooks no longer match this meeting.
      externalBotId: null,
    });
    if (!claimed) return 'skipped: already claimed';
    this.notifiedFailures.delete(claimed.id);
    this.events.emit(claimed);
    this.logger.log(
      { meetingId: claimed.id, status: 'joining', provider: bot.provider, mode: this.config.bot.mode },
      'meeting status changed',
    );

    const [userSettings, maxSeq] = await Promise.all([
      this.users.getSettings(claimed.userId),
      this.transcripts.maxSeq(claimed.id),
    ]);
    const botName = userSettings.botName?.trim() || bot.botName;
    if (bot.provider === 'recall') return this.dispatchToRecall(claimed, botName, bot);

    const session = new BotSession({
      meeting: claimed,
      events: this.events,
      transcripts: this.transcripts,
      notifications: this.notifications,
      aiQueue: this.aiQueue,
      redis: this.redis,
      logger: this.logger,
      startSeq: maxSeq + 1,
    });

    let finish!: () => void;
    const done = new Promise<void>((resolve) => (finish = resolve));
    this.active.set(claimed.id, { session, done });
    let outcome: SessionOutcome = {
      ok: false,
      reason: formatFailureReason('join', 'bot did not start'),
    };
    try {
      session.start();
      outcome =
        this.config.bot.mode === 'simulate'
          ? await this.simulateRunner.run({ session, botName })
          : await this.meetRunner.run({
              session,
              meetingUrl: meeting.meetingUrl,
              botName,
              bot,
            });
    } catch (err) {
      outcome = {
        ok: false,
        reason: failureReasonFrom(err, session.inCall ? 'capture' : 'join'),
      };
      this.logger.error({ meetingId: claimed.id, causes: causeChain(err) }, 'bot runner crashed');
    } finally {
      try {
        await session.finalize(outcome);
      } finally {
        if (session.failureNotified) this.trackNotified(claimed.id);
        this.active.delete(claimed.id);
        finish();
      }
    }
    return outcome.ok ? (outcome.reason ?? 'ok') : `failed: ${outcome.reason}`;
  }

  /**
   * Safety net when a job fails for good (crash outside the session). If the meeting is still
   * live, mark it failed and notify the user — unless the session already did.
   */
  protected override async onFinalFailure(job: Job<BotJoinJob>, err: Error): Promise<void> {
    const meetingId = job.data?.meetingId;
    if (!meetingId) return;
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || !LIVE_STATUSES.includes(meeting.status)) {
      this.notifiedFailures.delete(meetingId);
      return;
    }
    const reason = failureReasonFrom(err, meeting.status === 'in_progress' ? 'capture' : 'join');
    await this.failMeeting(meeting, reason, !this.notifiedFailures.has(meetingId));
    this.notifiedFailures.delete(meetingId);
  }

  /** SIGTERM: ask every bot to leave its call, then wait (bounded) for transcripts + AI hand-off. */
  async onModuleDestroy(): Promise<void> {
    if (!this.active.size) return;
    this.logger.log({ activeMeetings: this.active.size }, 'shutting down: leaving active meetings');
    for (const { session } of this.active.values()) session.requestStop('shutdown');
    const all = Promise.all([...this.active.values()].map((a) => a.done));
    await Promise.race([all, new Promise((r) => setTimeout(r, SHUTDOWN_GRACE_MS))]);
  }

  /** Provider `recall`: create the Recall.ai bot and return; its webhooks (worker) move the meeting on. */
  private async dispatchToRecall(meeting: MeetingRow, botName: string, bot: BotSettings): Promise<string> {
    try {
      const recallBotId = await this.recall.dispatch({
        meetingId: meeting.id,
        meetingUrl: normalizeMeetUrl(meeting.meetingUrl) ?? String(meeting.meetingUrl),
        botName,
        bot,
      });
      await this.meetings.update(meeting.id, { externalBotId: recallBotId });
      return 'dispatched to Recall.ai';
    } catch (err) {
      const reason = failureReasonFrom(err, 'join');
      this.logger.warn({ meetingId: meeting.id, causes: causeChain(err) }, 'recall dispatch failed');
      await this.failMeeting(meeting, reason);
      return `failed: ${reason}`;
    }
  }

  /** A live meeting without a running session: keep what was captured, never re-join automatically. */
  private async recoverOrphan(meeting: MeetingRow): Promise<string> {
    const segments = await this.transcripts.count(meeting.id);
    await this.redis.del(RedisKeys.botLeave(meeting.id)).catch(() => undefined);
    if (segments > 0) {
      await this.events.setStatus(meeting.id, 'processing', {
        botLeftAt: new Date(),
        failureReason: null,
      });
      await upsertJob<AiProcessJob>(
        this.aiQueue,
        JOB.AI_PROCESS,
        { meetingId: meeting.id },
        { jobId: JobId.ai(meeting.id) },
      );
      this.logger.warn({ meetingId: meeting.id, segments }, 'recovered orphaned bot session, AI processing queued');
      return 'recovered: processing';
    }
    await this.failMeeting(meeting, formatFailureReason('capture', 'bot process stopped unexpectedly'));
    this.logger.warn({ meetingId: meeting.id }, 'orphaned bot session marked failed');
    return 'recovered: failed';
  }

  private async failMeeting(meeting: MeetingRow, reason: string, notify = true): Promise<void> {
    await this.events.setStatus(meeting.id, 'failed', {
      failureReason: reason,
      ...(meeting.botJoinedAt && !meeting.botLeftAt ? { botLeftAt: new Date() } : {}),
    });
    this.logger.warn({ meetingId: meeting.id, failureReason: reason }, 'meeting status changed to failed');
    if (!notify || this.notifiedFailures.has(meeting.id)) return;
    this.trackNotified(meeting.id);
    await this.notifications.notify({
      userId: meeting.userId,
      type: 'bot_failed',
      templateKey: 'bot_failed',
      vars: { meetingTitle: meeting.title, reason },
      data: { meetingId: meeting.id },
    });
  }

  private trackNotified(meetingId: string): void {
    this.notifiedFailures.add(meetingId);
    if (this.notifiedFailures.size > MAX_TRACKED_NOTIFICATIONS) {
      const oldest = this.notifiedFailures.values().next().value;
      if (oldest !== undefined) this.notifiedFailures.delete(oldest);
    }
  }
}
