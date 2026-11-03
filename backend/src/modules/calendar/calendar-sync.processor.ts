import { InjectQueue, Processor } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { BaseProcessor, PermanentJobError } from '../../infra/queue/base.processor';
import { JOB, QUEUE, SyncUserJob } from '../../infra/queue/queue.constants';
import { GoogleAccountsRepository } from '../users/users.repository';
import { CalendarSyncService } from './calendar-sync.service';
import { enqueueUserSync } from './sync-producer';

const FAN_OUT_PAGE = 500;

/** `calendar-sync` queue: repeatable `sync-all` fans out one `sync-{userId}` job per connected user. */
@Processor(QUEUE.CALENDAR_SYNC, { concurrency: 4 })
export class CalendarSyncProcessor extends BaseProcessor<SyncUserJob | Record<string, never>> {
  constructor(
    private readonly sync: CalendarSyncService,
    private readonly accounts: GoogleAccountsRepository,
    @InjectQueue(QUEUE.CALENDAR_SYNC) private readonly queue: Queue,
  ) {
    super();
  }

  protected async handle(job: Job<SyncUserJob | Record<string, never>>): Promise<unknown> {
    if (job.name === JOB.SYNC_ALL) {
      let cursor: string | null = null;
      let queued = 0;
      for (;;) {
        const ids = await this.accounts.listConnectedUserIds(cursor, FAN_OUT_PAGE);
        for (const userId of ids) if (await enqueueUserSync(this.queue, userId, 'schedule')) queued++;
        if (ids.length < FAN_OUT_PAGE) break;
        cursor = ids[ids.length - 1];
      }
      return { queued };
    }
    if (job.name === JOB.SYNC_USER) {
      const { userId } = job.data as SyncUserJob;
      if (!userId) throw new PermanentJobError('sync job without userId');
      return this.sync.syncUser(userId);
    }
    throw new PermanentJobError(`Unknown calendar-sync job "${job.name}"`);
  }

  protected override async onFinalFailure(job: Job<SyncUserJob | Record<string, never>>): Promise<void> {
    if (job.name !== JOB.SYNC_USER) return;
    const { userId } = job.data as SyncUserJob;
    const account = await this.accounts.find(userId);
    if (account?.calendarConnected && !account.syncError) {
      await this.accounts.update(userId, { syncError: 'Calendar sync failed; it will retry on the next schedule.' });
    }
  }
}
