import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import { AiProcessJob, QUEUE } from '../../infra/queue/queue.constants';
import { BaseProcessor, PermanentJobError } from '../../infra/queue/base.processor';
import { AiPipelineService } from './ai-pipeline.service';

/** Reason stored on the meeting after the final attempt (safe, short, step-prefixed). */
export function aiFailureReason(err: Error): string {
  if (err instanceof PermanentJobError || err.name === 'UnrecoverableError') {
    const msg = err.message.slice(0, 250);
    return /^[a-z]+: /.test(msg) ? msg : `ai: ${msg}`;
  }
  if (err instanceof AppException) return `ai: ${err.message}`.slice(0, 300);
  return 'ai: processing failed after several attempts. You can reprocess the meeting.';
}

/** `ai-processing` queue (jobId `ai-{meetingId}`, 5 attempts, exponential backoff). */
@Processor(QUEUE.AI, { concurrency: 2 })
export class AiProcessor extends BaseProcessor<AiProcessJob> {
  constructor(private readonly pipeline: AiPipelineService) {
    super();
  }

  protected handle(job: Job<AiProcessJob>): Promise<unknown> {
    if (!job.data?.meetingId) throw new PermanentJobError('ai job without meetingId');
    return this.pipeline.process(job.data.meetingId, { transcribe: job.data.transcribe === true });
  }

  protected override onFinalFailure(job: Job<AiProcessJob>, err: Error): Promise<void> {
    return this.pipeline.markFailed(job.data.meetingId, aiFailureReason(err));
  }
}
