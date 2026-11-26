import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AppConfig } from '../../config/app-config';
import { JOB, QUEUE } from './queue.constants';

/** Registers the repeatable schedulers (worker process only). Upserts are idempotent across replicas. */
@Injectable()
export class RepeatableJobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RepeatableJobsService.name);

  constructor(
    private readonly config: AppConfig,
    @InjectQueue(QUEUE.CALENDAR_SYNC) private readonly syncQueue: Queue,
    @InjectQueue(QUEUE.DIGEST) private readonly digestQueue: Queue,
    @InjectQueue(QUEUE.COMPANION) private readonly companionQueue: Queue,
    @InjectQueue(QUEUE.INTEGRATIONS) private readonly integrationsQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const every = this.config.calendarSyncIntervalMinutes * 60_000;
      await this.syncQueue.upsertJobScheduler('sync-all', { every }, { name: JOB.SYNC_ALL, data: {} });
      await this.digestQueue.upsertJobScheduler(
        'digest-hourly',
        { pattern: '0 * * * *' },
        { name: JOB.DIGEST_TICK, data: {} },
      );
      await this.digestQueue.upsertJobScheduler(
        'cleanup-daily',
        { pattern: '30 3 * * *' },
        { name: JOB.CLEANUP, data: {} },
      );
      // Wake times and check-in times are "HH:MM", so the daily rhythm needs a finer tick than hourly.
      await this.companionQueue.upsertJobScheduler(
        'rhythm-5min',
        { pattern: '*/5 * * * *' },
        { name: JOB.RHYTHM_TICK, data: {} },
      );
      // Connected apps: new emails every few minutes, task status in the tools every 15 minutes.
      await this.integrationsQueue.upsertJobScheduler(
        'email-poll',
        { every: this.config.integrations.emailPollIntervalMinutes * 60_000 },
        { name: JOB.EMAIL_POLL, data: {} },
      );
      await this.integrationsQueue.upsertJobScheduler(
        'tools-watch-15min',
        { pattern: '*/15 * * * *' },
        { name: JOB.TOOLS_WATCH, data: {} },
      );
      this.logger.log({ syncEveryMinutes: this.config.calendarSyncIntervalMinutes }, 'repeatable jobs registered');
    } catch (err) {
      this.logger.error(
        { errName: (err as Error).name },
        `could not register repeatable jobs: ${(err as Error).message}`,
      );
    }
  }
}
