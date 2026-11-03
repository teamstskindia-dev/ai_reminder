import type { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { causeChain } from '../../../common/errors/app.exception';
import type { MeetingStatus } from '../../../common/types/api.types';
import type { MeetingRow } from '../../../infra/prisma/models';
import { Prisma } from '../../../infra/prisma/models';
import { upsertJob } from '../../../infra/queue/job-utils';
import { AiProcessJob, JOB, JobId } from '../../../infra/queue/queue.constants';
import { RedisKeys } from '../../../infra/redis/redis.constants';
import type { MeetingEventsService } from '../../meetings/meeting-events.service';
import type { TranscriptRepository } from '../../meetings/meetings.repository';
import type { NotificationProducer } from '../../notifications/notification-producer.service';
import { formatFailureReason } from './bot-step-error';
import { CaptionAggregator, FinalSegment } from './caption-aggregator';

/** Why a session stops: 'leave_requested' (user/leave flag), 'shutdown' (SIGTERM) or a runner reason. */
export type StopReason = string;

/**
 * Result reported by a runner. `ok: false` means the bot could not do its job; `reason` is then a
 * step-prefixed, sanitised failure reason (see bot-step-error.ts).
 */
export type SessionOutcome = { ok: true; reason?: string } | { ok: false; reason: string };

export interface BotSessionDeps {
  meeting: MeetingRow;
  events: MeetingEventsService;
  transcripts: TranscriptRepository;
  notifications: NotificationProducer;
  aiQueue: Queue;
  redis: Redis;
  logger: Logger;
  /** First transcript seq to use (continues an existing transcript on re-join). */
  startSeq?: number;
  flushIntervalMs?: number;
  leavePollMs?: number;
}

/**
 * Per-meeting bot state shared by the Meet and simulate runners: status transitions
 * (joining → waiting_room → in_progress → processing/failed), caption aggregation and
 * batched transcript writes, leave-flag polling and the final hand-off to AI processing.
 *
 * Privacy: logs carry ids, statuses, counts and durations only — never caption text,
 * speaker names or transcript content.
 */
export class BotSession {
  readonly meetingId: string;
  private readonly deps: BotSessionDeps;
  private aggregator: CaptionAggregator | null = null;
  private stopReason: StopReason | null = null;
  private readonly stopWaiters = new Set<() => void>();
  private flushTimer?: NodeJS.Timeout;
  private pollTimer?: NodeJS.Timeout;
  private flushing: Promise<void> = Promise.resolve();
  private readonly startedAt = Date.now();
  private joinedAt: Date | null = null;
  private waitingMarked = false;
  private finalizedFlag = false;
  private failureNotifiedFlag = false;
  private segmentsWritten = 0;
  private captionUpdates = 0;

  constructor(deps: BotSessionDeps) {
    this.deps = deps;
    this.meetingId = deps.meeting.id;
  }

  get meeting(): MeetingRow {
    return this.deps.meeting;
  }

  get stopRequested(): boolean {
    return this.stopReason !== null;
  }

  get stopReasonValue(): StopReason | null {
    return this.stopReason;
  }

  get inCall(): boolean {
    return this.joinedAt !== null;
  }

  /** True once finalize() ran (the meeting reached processing/failed/cancelled). */
  get finalized(): boolean {
    return this.finalizedFlag;
  }

  /** True when finalize() already sent the `bot_failed` notification. */
  get failureNotified(): boolean {
    return this.failureNotifiedFlag;
  }

  /** Starts background timers (transcript flush + leave-flag polling). */
  start(): void {
    this.flushTimer = setInterval(() => void this.flush(false), this.deps.flushIntervalMs ?? 5000);
    this.pollTimer = setInterval(() => void this.pollLeaveFlag(), this.deps.leavePollMs ?? 3000);
  }

  requestStop(reason: StopReason): void {
    if (this.stopReason) return;
    this.stopReason = reason;
    this.deps.logger.log({ meetingId: this.meetingId, reason }, 'bot stop requested');
    for (const wake of this.stopWaiters) wake();
    this.stopWaiters.clear();
  }

  /** Sleeps `ms`, resolving early when a stop is requested. Returns true if stopped. */
  sleep(ms: number): Promise<boolean> {
    if (this.stopReason) return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.stopWaiters.delete(done);
        resolve(this.stopRequested);
      };
      const timer = setTimeout(done, ms);
      this.stopWaiters.add(done);
    });
  }

  async markWaitingRoom(): Promise<void> {
    if (this.waitingMarked || this.joinedAt) return;
    this.waitingMarked = true;
    await this.setStatus('waiting_room');
  }

  async markInCall(): Promise<void> {
    if (this.joinedAt) return;
    this.joinedAt = new Date();
    this.aggregator = new CaptionAggregator({
      meetingStartMs: this.joinedAt.getTime(),
      startSeq: this.deps.startSeq ?? 0,
    });
    await this.setStatus('in_progress', {
      botJoinedAt: this.joinedAt,
      failureReason: null,
    });
  }

  /** Called for every caption update coming from the page (or the simulator). */
  onCaption(speaker: string, text: string): void {
    if (!this.aggregator || this.finalizedFlag) return;
    this.captionUpdates++;
    this.aggregator.push(speaker, text, Date.now());
  }

  /** Writes finalised segments. `all` drains open segments too (end of meeting). */
  flush(all: boolean): Promise<void> {
    this.flushing = this.flushing.then(async () => {
      if (!this.aggregator) return;
      const segments: FinalSegment[] = all ? this.aggregator.drain(Date.now()) : this.aggregator.flushIdle(Date.now());
      if (!segments.length) return;
      try {
        await this.deps.transcripts.insertMany(
          this.meetingId,
          segments.map((s) => ({
            seq: s.seq,
            speaker: s.speaker,
            text: s.text,
            startMs: s.startMs,
            endMs: s.endMs,
          })),
        );
        this.segmentsWritten += segments.length;
        this.deps.logger.debug(
          {
            meetingId: this.meetingId,
            segments: segments.length,
            total: this.segmentsWritten,
          },
          'transcript segments flushed',
        );
      } catch (err) {
        this.deps.logger.error(
          {
            meetingId: this.meetingId,
            segments: segments.length,
            causes: causeChain(err),
          },
          'transcript write failed',
        );
      }
    });
    return this.flushing;
  }

  /**
   * Ends the session. Captured segments are always persisted first; then the meeting either moves to
   * `processing` (+ `ai-{meetingId}` job) or to `failed`/`cancelled` (+ one `bot_failed` notification).
   * Idempotent.
   */
  async finalize(outcome: SessionOutcome): Promise<void> {
    if (this.finalizedFlag) return;
    this.finalizedFlag = true;
    clearInterval(this.flushTimer);
    clearInterval(this.pollTimer);
    const { meeting, transcripts, redis, logger } = this.deps;
    await this.flush(true);
    const leftAt = new Date();

    let segmentCount = this.segmentsWritten;
    try {
      segmentCount = await transcripts.count(this.meetingId);
    } catch (err) {
      logger.warn({ meetingId: this.meetingId, causes: causeChain(err) }, 'could not count transcript segments');
    }
    await redis.del(RedisKeys.botLeave(this.meetingId)).catch(() => undefined);

    const summary = {
      meetingId: this.meetingId,
      ok: outcome.ok,
      outcome: outcome.reason ?? null,
      segments: segmentCount,
      captionUpdates: this.captionUpdates,
      inCallSeconds: this.joinedAt ? Math.round((leftAt.getTime() - this.joinedAt.getTime()) / 1000) : 0,
      sessionMs: leftAt.getTime() - this.startedAt,
    };

    if (segmentCount > 0) {
      const durationSeconds = this.joinedAt
        ? Math.max(0, Math.round((leftAt.getTime() - this.joinedAt.getTime()) / 1000))
        : null;
      await this.setStatus('processing', {
        botLeftAt: leftAt,
        durationSeconds,
        failureReason: null,
      });
      try {
        await upsertJob<AiProcessJob>(
          this.deps.aiQueue,
          JOB.AI_PROCESS,
          { meetingId: this.meetingId },
          { jobId: JobId.ai(this.meetingId) },
        );
        logger.log(summary, 'bot session finished, AI processing queued');
      } catch (err) {
        logger.error({ ...summary, causes: causeChain(err) }, 'could not enqueue AI processing');
      }
      return;
    }

    if (this.stopReason === 'leave_requested' && outcome.ok) {
      await this.setStatus('cancelled', {
        botLeftAt: this.joinedAt ? leftAt : null,
        failureReason: 'leave: bot was asked to leave before anything was captured',
      });
      logger.log(summary, 'bot session cancelled by user');
      return;
    }

    const reason = outcome.ok
      ? this.joinedAt
        ? formatFailureReason('capture', 'No captions were captured')
        : formatFailureReason('admission', 'Not admitted to the meeting')
      : formatFailureReason(null, outcome.reason);
    await this.setStatus('failed', {
      botLeftAt: this.joinedAt ? leftAt : null,
      failureReason: reason,
    });
    logger.warn({ ...summary, failureReason: reason }, 'bot session failed');
    this.failureNotifiedFlag = true;
    await this.deps.notifications.notify({
      userId: meeting.userId,
      type: 'bot_failed',
      templateKey: 'bot_failed',
      vars: { meetingTitle: meeting.title, reason },
      data: { meetingId: this.meetingId },
    });
  }

  private async setStatus(status: MeetingStatus, extra: Prisma.MeetingUncheckedUpdateInput = {}): Promise<void> {
    try {
      await this.deps.events.setStatus(this.meetingId, status, extra);
      this.deps.logger.log(
        {
          meetingId: this.meetingId,
          status,
          elapsedMs: Date.now() - this.startedAt,
        },
        'meeting status changed',
      );
    } catch (err) {
      this.deps.logger.error({ meetingId: this.meetingId, status, causes: causeChain(err) }, 'status update failed');
    }
  }

  private async pollLeaveFlag(): Promise<void> {
    if (this.stopReason) return;
    try {
      const flag = await this.deps.redis.get(RedisKeys.botLeave(this.meetingId));
      if (flag) this.requestStop('leave_requested');
    } catch (err) {
      this.deps.logger.warn({ meetingId: this.meetingId, causes: causeChain(err) }, 'leave flag check failed');
    }
  }
}
