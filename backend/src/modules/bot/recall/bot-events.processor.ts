import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BaseProcessor, PermanentJobError } from '../../../infra/queue/base.processor';
import { JOB, QUEUE, RecallEventJob } from '../../../infra/queue/queue.constants';
import { RecallEventsService } from './recall-events.service';

/** `bot-events` queue (worker): Recall.ai webhook events, one job per delivery (8 attempts, exponential backoff). */
@Processor(QUEUE.BOT_EVENTS, { concurrency: 4 })
export class BotEventsProcessor extends BaseProcessor<RecallEventJob> {
  constructor(private readonly recall: RecallEventsService) {
    super();
  }

  protected handle(job: Job<RecallEventJob>): Promise<string> {
    if (job.name !== JOB.RECALL_EVENT) throw new PermanentJobError(`unknown bot-events job "${job.name}"`);
    if (!job.data?.botId || !job.data.event) throw new PermanentJobError('bot event without botId/event');
    return this.recall.handle(job.data);
  }

  protected override onFinalFailure(job: Job<RecallEventJob>, err: Error): Promise<void> {
    if (job.name !== JOB.RECALL_EVENT || !job.data?.botId) return Promise.resolve();
    return this.recall.onFinalFailure(job.data, err);
  }
}
