import { Logger } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import { withCorrelation } from '../../common/context/request-context';

const logger = new Logger('JobUtils');

export interface UpsertResult {
  added: boolean;
  state: string;
}

/**
 * Idempotently (re)schedules a job with a deterministic id.
 * - active jobs are never touched;
 * - `keep` leaves an existing waiting/delayed job alone;
 * - `replace` removes a waiting/delayed job unless it already runs at `runAt` (±1s);
 * - completed/failed leftovers with the same id are removed first (BullMQ would ignore the add otherwise).
 */
export async function upsertJob<T>(
  queue: Queue,
  name: string,
  data: T,
  opts: JobsOptions & { jobId: string },
  mode: 'replace' | 'keep' = 'replace',
): Promise<UpsertResult> {
  const existing = await queue.getJob(opts.jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'active') return { added: false, state };
    const pending =
      state === 'waiting' || state === 'delayed' || state === 'prioritized' || state === 'waiting-children';
    if (pending && mode === 'keep') return { added: false, state };
    if (pending && opts.delay !== undefined) {
      const currentRunAt = existing.timestamp + (existing.delay ?? 0);
      const targetRunAt = Date.now() + opts.delay;
      if (state === 'delayed' && Math.abs(currentRunAt - targetRunAt) < 1000 && sameData(existing.data, data)) {
        return { added: false, state };
      }
    }
    try {
      await existing.remove();
    } catch (err) {
      logger.warn(`Could not remove job ${opts.jobId}: ${(err as Error).message}`);
      return { added: false, state: await existing.getState() };
    }
  }
  await queue.add(name, withCorrelation(data as object), opts);
  return { added: true, state: opts.delay ? 'delayed' : 'waiting' };
}

/** Adds a job with the current correlation id. */
export function addJob<T extends object>(queue: Queue, name: string, data: T, opts?: JobsOptions) {
  return queue.add(name, withCorrelation(data), opts);
}

/** Removes a job unless it is currently running. Returns true when removed (or absent). */
export async function removeJob(queue: Queue, jobId: string): Promise<boolean> {
  const job = await queue.getJob(jobId);
  if (!job) return true;
  const state = await job.getState();
  if (state === 'active') return false;
  try {
    await job.remove();
    return true;
  } catch (err) {
    logger.warn(`Could not remove job ${jobId}: ${(err as Error).message}`);
    return false;
  }
}

function sameData(a: unknown, b: unknown): boolean {
  const strip = (v: unknown) => {
    if (!v || typeof v !== 'object') return v;
    const rest: Record<string, unknown> = { ...(v as Record<string, unknown>) };
    delete rest.correlationId;
    return rest;
  };
  try {
    return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
  } catch {
    return false;
  }
}
