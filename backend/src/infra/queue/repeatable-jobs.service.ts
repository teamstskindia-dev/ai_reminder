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
      this.logger.log({ syncEveryMinutes: this.config.calendarSyncIntervalMinutes }, 'repeatable jobs registered');
    } catch (err) {
      this.logger.error(
        { errName: (err as Error).name },
        `could not register repeatable jobs: ${(err as Error).message}`,
      );
    }
  }
}
