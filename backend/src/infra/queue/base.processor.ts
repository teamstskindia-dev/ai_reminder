import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { RequestContext } from '../../common/context/request-context';
import { AppException, causeChain, UpstreamError } from '../../common/errors/app.exception';

/** Throw for failures that retrying cannot fix (deleted rows, invalid input, revoked grants). */
export class PermanentJobError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PermanentJobError';
  }
}

/** Permanent = will fail the same way on retry. Upstream/network/unknown errors stay retryable. */
export function isPermanentError(err: unknown): boolean {
  if (err instanceof UnrecoverableError || err instanceof PermanentJobError) return true;
  if (err instanceof UpstreamError) return !err.retryable;
  if (err instanceof AppException) return err.getStatus() < 500;
  return false;
}

export function isFinalAttempt(job: Job, err: unknown): boolean {
  if (err instanceof UnrecoverableError || (err as Error)?.name === 'UnrecoverableError') return true;
  return job.attemptsMade >= (job.opts.attempts ?? 1);
}

/**
 * Base for every BullMQ processor: runs the job inside a correlation context (the request id that
 * enqueued it), logs start/complete/fail with queue, jobId, name, attempt and duration, converts
 * permanent failures into UnrecoverableError (no wasted retries) and calls `onFinalFailure` once.
 */
export abstract class BaseProcessor<T = unknown> extends WorkerHost {
  protected readonly logger = new Logger(this.constructor.name);

  protected abstract handle(job: Job<T>): Promise<unknown>;

  /** Called once when a job will not be retried any more (set domain state, notify the user). */
  protected onFinalFailure(job: Job<T>, err: Error): Promise<void> {
    this.logger.debug({ jobId: job.id, errName: err.name }, 'no final-failure handler');
    return Promise.resolve();
  }

  private context(job: Job<T>) {
    const data = job.data as { correlationId?: unknown } | undefined;
    const correlationId =
      typeof data?.correlationId === 'string' ? data.correlationId : `job:${job.queueName}:${job.id ?? 'unknown'}`;
    return { requestId: correlationId, jobId: job.id, queue: job.queueName };
  }

  async process(job: Job<T>): Promise<unknown> {
    const ctx = this.context(job);
    return RequestContext.run(ctx, async () => {
      const meta = {
        queue: job.queueName,
        jobId: job.id,
        name: job.name,
        attempt: job.attemptsMade + 1,
        correlationId: ctx.requestId,
      };
      const started = Date.now();
      this.logger.log(meta, 'job started');
      try {
        const result = await this.handle(job);
        this.logger.log({ ...meta, durationMs: Date.now() - started }, 'job completed');
        return result;
      } catch (err) {
        const permanent = isPermanentError(err);
        const fields = {
          ...meta,
          durationMs: Date.now() - started,
          permanent,
          err: err instanceof Error ? err : undefined,
          causes: causeChain(err),
        };
        if (permanent) this.logger.warn(fields, 'job failed permanently');
        else this.logger.error(fields, 'job failed');
        if (permanent && !(err instanceof UnrecoverableError)) {
          throw new UnrecoverableError(err instanceof Error ? err.message : String(err));
        }
        throw err;
      }
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<T> | undefined, err: Error): Promise<void> {
    if (!job || !isFinalAttempt(job, err)) return;
    await RequestContext.run(this.context(job), async () => {
      try {
        await this.onFinalFailure(job, err);
      } catch (hookErr) {
        this.logger.error({ jobId: job.id, causes: causeChain(hookErr) }, 'final-failure handler failed');
      }
    });
  }

  @OnWorkerEvent('error')
  onWorkerError(err: Error): void {
    this.logger.error({ causes: causeChain(err) }, 'worker error');
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn({ jobId }, 'job stalled (will be retried)');
  }
}
