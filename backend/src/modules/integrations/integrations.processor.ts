import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BaseProcessor, PermanentJobError } from '../../infra/queue/base.processor';
import { EmailBundleJob, EmailSyncJob, JOB, QUEUE, ToolTaskRetryJob } from '../../infra/queue/queue.constants';
import { EmailSyncService } from '../email/email-sync.service';
import { ToolTasksService } from '../tools/tool-tasks.service';

type IntegrationsJobData = EmailSyncJob | EmailBundleJob | ToolTaskRetryJob | Record<string, never>;

/** `integrations` queue: email polling and triage, batched email pushes, tool task retries and status watching. */
@Processor(QUEUE.INTEGRATIONS, { concurrency: 4 })
export class IntegrationsProcessor extends BaseProcessor<IntegrationsJobData> {
  constructor(
    private readonly email: EmailSyncService,
    private readonly tools: ToolTasksService,
  ) {
    super();
  }

  protected async handle(job: Job<IntegrationsJobData>): Promise<unknown> {
    switch (job.name) {
      case JOB.EMAIL_POLL:
        return this.email.poll();
      case JOB.EMAIL_SYNC:
        return this.email.sync((job.data as EmailSyncJob).accountId);
      case JOB.EMAIL_BUNDLE:
        return { outcome: await this.email.sendBundle(job.data as EmailBundleJob) };
      case JOB.TOOLS_WATCH:
        return this.tools.watch();
      case JOB.TOOL_TASK_RETRY:
        return { outcome: await this.tools.retry((job.data as ToolTaskRetryJob).taskId) };
      default:
        throw new PermanentJobError(`Unknown integrations job "${job.name}"`);
    }
  }
}
