import { Injectable, Logger } from '@nestjs/common';
import { AuthSessionsRepository } from './auth-sessions.repository';

/**
 * Sessions are kept this long after they expire, so a stolen token replayed shortly after expiry still
 * revokes its family (theft detection), then removed.
 */
export const SESSION_RETENTION_DAYS = 7;
const BATCH_SIZE = 5000;
/** Caps one run (1M rows); a larger backlog is finished by the next daily runs. */
const MAX_BATCHES = 200;

/** Runs `deleteBatch` until it removes fewer rows than asked for (or the cap is hit). Returns the total. */
export async function deleteInBatches(
  deleteBatch: (limit: number) => Promise<number>,
  batchSize = BATCH_SIZE,
  maxBatches = MAX_BATCHES,
): Promise<{ deleted: number; complete: boolean }> {
  let deleted = 0;
  for (let i = 0; i < maxBatches; i++) {
    const n = await deleteBatch(batchSize);
    deleted += n;
    if (n < batchSize) return { deleted, complete: true };
  }
  return { deleted, complete: false };
}

/**
 * Daily housekeeping (worker, `digest` queue `cleanup` job). Every refresh rotation inserts an
 * `auth_sessions` row and nothing else removes them, so without this the table grows for ever.
 */
@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(private readonly sessions: AuthSessionsRepository) {}

  async run(now: Date = new Date()): Promise<{ deleted: number; complete: boolean }> {
    const before = new Date(now.getTime() - SESSION_RETENTION_DAYS * 86_400_000);
    const result = await deleteInBatches((limit) => this.sessions.deleteExpiredBatch(before, limit));
    this.logger.log({ ...result, before: before.toISOString() }, 'expired auth sessions pruned');
    return result;
  }
}
