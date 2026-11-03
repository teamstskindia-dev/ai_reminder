import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { NotificationType, ReminderChannel } from '../../common/types/api.types';
import { addJob } from '../../infra/queue/job-utils';
import { JOB, NotifyJob, QUEUE } from '../../infra/queue/queue.constants';

export interface NotifyRequest {
  userId: string;
  type: NotificationType;
  templateKey: string;
  vars: Record<string, string | number | null>;
  data?: Record<string, unknown>;
  /** Defaults to the template's channels. */
  channels?: ReminderChannel[];
}

/** Enqueues template-based notifications for the worker (`notifications` queue, job `notify`). */
@Injectable()
export class NotificationProducer {
  private readonly logger = new Logger(NotificationProducer.name);

  constructor(@InjectQueue(QUEUE.NOTIFICATIONS) private readonly queue: Queue) {}

  async notify(req: NotifyRequest): Promise<void> {
    const job: NotifyJob = {
      userId: req.userId,
      type: req.type,
      templateKey: req.templateKey,
      vars: req.vars,
      data: req.data,
      channels: req.channels,
    };
    try {
      await addJob(this.queue, JOB.NOTIFY, job);
    } catch (err) {
      this.logger.error(`Could not enqueue ${req.type} notification: ${(err as Error).message}`);
    }
  }
}
