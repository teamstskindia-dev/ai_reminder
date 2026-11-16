import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { causeChain } from '../../../common/errors/app.exception';
import type { MeetingStatus } from '../../../common/types/api.types';
import type { MeetingRow } from '../../../infra/prisma/models';
import { RecallClient } from '../../../infra/recall/recall.client';
import { upsertJob } from '../../../infra/queue/job-utils';
import { AiProcessJob, JOB, JobId, QUEUE, RecallEventJob } from '../../../infra/queue/queue.constants';
import { SettingsService } from '../../content/settings.service';
import { MeetingEventsService } from '../../meetings/meeting-events.service';
import { LIVE_STATUSES, MeetingsRepository, TranscriptRepository } from '../../meetings/meetings.repository';
import { NotificationProducer } from '../../notifications/notification-producer.service';
import { formatFailureReason } from '../runner/bot-step-error';
import { analyseBot, FINAL_EVENTS, statusesBefore, statusForEvent, transcriptToSegments } from './recall-mapping';

/** The transcript is still being produced: the job is retried with backoff (bot-events queue). */
export class TranscriptNotReadyError extends Error {
  constructor() {
    super('Recall.ai transcript is not ready yet');
    this.name = 'TranscriptNotReadyError';
  }
}

/** Meetings a Recall.ai event may still change. */
const OPEN_STATUSES = [...LIVE_STATUSES, 'processing'];

/**
 * Applies Recall.ai bot events to meetings (worker, `bot-events` queue). Events can arrive late, twice or out
 * of order, so every step is idempotent: in-call events only move a meeting forward, and the final step reads
 * the bot from Recall.ai (the source of truth) before importing the transcript into the normal AI pipeline.
 *
 * Privacy: logs carry ids, event names, statuses and counts only — never transcript text or names.
 */
@Injectable()
export class RecallEventsService {
  private readonly logger = new Logger(RecallEventsService.name);

  constructor(
    private readonly client: RecallClient,
    private readonly meetings: MeetingsRepository,
    private readonly transcripts: TranscriptRepository,
    private readonly events: MeetingEventsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationProducer,
    @InjectQueue(QUEUE.AI) private readonly aiQueue: Queue,
  ) {}

  async handle(job: RecallEventJob): Promise<string> {
    const meeting = await this.meetings.findByExternalBotId(job.botId);
    if (!meeting) return 'ignored: unknown bot';
    if (!OPEN_STATUSES.includes(meeting.status)) return `ignored: meeting is ${meeting.status}`;

    const status = statusForEvent(job.event);
    if (status) return this.advance(meeting, status, job);
    if (job.event === 'bot.call_ended') return this.callEnded(meeting, job);
    if (FINAL_EVENTS.has(job.event)) return this.finalize(meeting, job.botId);
    return `ignored: ${job.event}`;
  }

  /** Final failure of a bot-events job (e.g. the transcript never became ready). */
  async onFinalFailure(job: RecallEventJob, err: Error): Promise<void> {
    if (!FINAL_EVENTS.has(job.event)) return;
    const meeting = await this.meetings.findByExternalBotId(job.botId);
    if (!meeting || !OPEN_STATUSES.includes(meeting.status)) return;
    if ((await this.transcripts.count(meeting.id)) > 0) return;
    const reason =
      err instanceof TranscriptNotReadyError
        ? formatFailureReason('capture', 'Recall.ai did not deliver the transcript in time')
        : formatFailureReason('capture', 'The recording could not be imported from Recall.ai');
    await this.fail(meeting, reason);
  }

  private async advance(meeting: MeetingRow, status: MeetingStatus, job: RecallEventJob): Promise<string> {
    const at = (job.updatedAt && new Date(job.updatedAt)) || new Date();
    const joinedAt = Number.isNaN(at.getTime()) ? new Date() : at;
    const row = await this.meetings.updateIfStatus(meeting.id, statusesBefore(status), {
      status,
      failureReason: null,
      ...(status === 'in_progress' && !meeting.botJoinedAt ? { botJoinedAt: joinedAt } : {}),
    });
    if (!row) return `unchanged: ${meeting.status}`;
    this.events.emit(row);
    this.logger.log({ meetingId: meeting.id, event: job.event, status }, 'meeting status changed');
    return `status: ${status}`;
  }

  private async callEnded(meeting: MeetingRow, job: RecallEventJob): Promise<string> {
    if (!meeting.botJoinedAt || meeting.botLeftAt) return 'unchanged';
    const at = job.updatedAt ? new Date(job.updatedAt) : new Date();
    await this.meetings.update(meeting.id, { botLeftAt: Number.isNaN(at.getTime()) ? new Date() : at });
    return 'left call';
  }

  private async finalize(meeting: MeetingRow, botId: string): Promise<string> {
    if (meeting.status === 'processing' && (await this.transcripts.count(meeting.id)) > 0) {
      return 'skipped: transcript already imported';
    }
    const outcome = analyseBot(await this.client.getBot(botId));
    if (!outcome.finished) return 'waiting: bot is still in the call';
    if (!outcome.recorded) {
      await this.fail(meeting, outcome.failureReason ?? formatFailureReason('admission', 'Not admitted'));
      return `failed: ${outcome.failureReason}`;
    }

    const joinedAt = meeting.botJoinedAt ?? outcome.joinedAt;
    const leftAt = meeting.botLeftAt ?? outcome.leftAt ?? new Date();
    const durationSeconds = joinedAt ? Math.max(0, Math.round((leftAt.getTime() - joinedAt.getTime()) / 1000)) : null;
    if (meeting.status !== 'processing') {
      await this.events.setStatus(meeting.id, 'processing', {
        botJoinedAt: joinedAt,
        botLeftAt: leftAt,
        durationSeconds,
        failureReason: null,
      });
    }

    const transcript = outcome.transcript;
    if (transcript.state === 'processing') throw new TranscriptNotReadyError();
    if (transcript.state !== 'done') {
      await this.fail(meeting, formatFailureReason('capture', 'Recall.ai could not produce a transcript'));
      return `failed: transcript ${transcript.state}`;
    }

    const segments = transcriptToSegments(await this.client.downloadTranscript(transcript.downloadUrl));
    if (!segments.length) {
      await this.fail(meeting, formatFailureReason('capture', 'No speech was captured'));
      return 'failed: empty transcript';
    }
    await this.transcripts.replaceAll(meeting.id, segments);
    await upsertJob<AiProcessJob>(
      this.aiQueue,
      JOB.AI_PROCESS,
      { meetingId: meeting.id },
      { jobId: JobId.ai(meeting.id) },
    );
    this.logger.log(
      { meetingId: meeting.id, segments: segments.length, durationSeconds },
      'recall transcript imported',
    );

    const { recall } = await this.settings.get('bot');
    if (recall.deleteMediaAfterImport) {
      // Remi now holds the transcript; the recording is not kept on Recall.ai. Failure only costs storage there.
      await this.client.deleteMedia(botId).catch((err: unknown) => {
        this.logger.warn({ meetingId: meeting.id, causes: causeChain(err) }, 'could not delete media on Recall.ai');
      });
    }
    return `imported: ${segments.length} segments`;
  }

  private async fail(meeting: MeetingRow, reason: string): Promise<void> {
    const row = await this.meetings.updateIfStatus(meeting.id, OPEN_STATUSES, {
      status: 'failed',
      failureReason: reason,
      ...(meeting.botJoinedAt && !meeting.botLeftAt ? { botLeftAt: new Date() } : {}),
    });
    if (!row) return; // Another event already finished this meeting.
    this.events.emit(row);
    this.logger.warn({ meetingId: meeting.id, failureReason: reason }, 'meeting status changed to failed');
    await this.notifications.notify({
      userId: meeting.userId,
      type: 'bot_failed',
      templateKey: 'bot_failed',
      vars: { meetingTitle: meeting.title, reason },
      data: { meetingId: meeting.id },
    });
  }
}
