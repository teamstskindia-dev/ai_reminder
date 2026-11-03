import { InjectQueue, Processor } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { causeChain } from '../../common/errors/app.exception';
import type { NotificationType, ReminderChannel } from '../../common/types/api.types';
import { BaseProcessor, PermanentJobError } from '../../infra/queue/base.processor';
import { upsertJob } from '../../infra/queue/job-utils';
import { BroadcastJob, JOB, JobId, NotifyJob, QUEUE, ReminderJob } from '../../infra/queue/queue.constants';
import { BroadcastDispatchService } from './broadcast-dispatch.service';
import { DeliveryService } from './delivery.service';
import { DigestService } from './digest.service';
import { ReminderDispatchService } from './reminder-dispatch.service';

type NotificationsJobData = ReminderJob | NotifyJob | BroadcastJob;

/** `notifications` queue: delayed reminders, template notifications and admin broadcasts. */
@Processor(QUEUE.NOTIFICATIONS)
export class NotificationsProcessor extends BaseProcessor<NotificationsJobData> {
  constructor(
    private readonly reminders: ReminderDispatchService,
    private readonly delivery: DeliveryService,
    private readonly broadcasts: BroadcastDispatchService,
  ) {
    super();
  }

  protected async handle(job: Job<NotificationsJobData>): Promise<unknown> {
    switch (job.name) {
      case JOB.REMINDER: {
        const data = job.data as ReminderJob;
        return { outcome: await this.reminders.dispatch(data.reminderId, data.remindAt) };
      }
      case JOB.NOTIFY: {
        const data = job.data as NotifyJob;
        const res = await this.delivery.deliver({
          userId: data.userId,
          type: data.type as NotificationType,
          templateKey: data.templateKey,
          vars: data.vars,
          data: data.data,
          channels: data.channels as ReminderChannel[] | undefined,
        });
        return { delivered: res.delivered };
      }
      case JOB.BROADCAST:
        return { sent: await this.broadcasts.dispatch((job.data as BroadcastJob).broadcastId) };
      default:
        throw new PermanentJobError(`Unknown notifications job "${job.name}"`);
    }
  }

  protected override async onFinalFailure(job: Job<NotificationsJobData>, err: Error): Promise<void> {
    if (job.name === JOB.REMINDER) {
      const reason = `Delivery failed: ${causeChain(err)[0] ?? 'unknown error'}`;
      await this.reminders.markFailed((job.data as ReminderJob).reminderId, reason);
    }
  }
}

/** `digest` queue: hourly tick → one idempotent `digest-{yyyyMMddHH}` run per hour. */
@Processor(QUEUE.DIGEST)
export class DigestProcessor extends BaseProcessor<Record<string, unknown>> {
  constructor(
    private readonly digest: DigestService,
    @InjectQueue(QUEUE.DIGEST) private readonly queue: Queue,
  ) {
    super();
  }

  protected async handle(job: Job<Record<string, unknown>>): Promise<unknown> {
    if (job.name === JOB.DIGEST_TICK) {
      const hourKey = new Date().toISOString().slice(0, 13).replace(/\D/g, '');
      const res = await upsertJob(this.queue, JOB.DIGEST_RUN, {}, { jobId: JobId.digest(hourKey) }, 'keep');
      return { scheduled: res.added, hourKey };
    }
    if (job.name === JOB.DIGEST_RUN) return this.digest.run();
    throw new PermanentJobError(`Unknown digest job "${job.name}"`);
  }
}
