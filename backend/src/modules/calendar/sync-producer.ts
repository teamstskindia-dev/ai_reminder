import type { Queue } from 'bullmq';
import { upsertJob } from '../../infra/queue/job-utils';
import { JOB, JobId, SyncUserJob } from '../../infra/queue/queue.constants';

/** Enqueues a calendar sync for one user (deduplicated by job id `sync-{userId}`). */
export async function enqueueUserSync(queue: Queue, userId: string, reason: string): Promise<boolean> {
  const res = await upsertJob<SyncUserJob>(
    queue,
    JOB.SYNC_USER,
    { userId, reason },
    { jobId: JobId.sync(userId), removeOnComplete: true },
    'keep',
  );
  return res.added || res.state !== 'unknown';
}
