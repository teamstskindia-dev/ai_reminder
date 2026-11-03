import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { ReminderRow } from '../../infra/prisma/models';
import { removeJob, upsertJob } from '../../infra/queue/job-utils';
import { JOB, JobId, QUEUE, ReminderJob } from '../../infra/queue/queue.constants';
import { RemindersRepository } from './reminders.repository';

/** Keeps one delayed `notifications` job (`reminder-{id}`) per pending reminder row. */
@Injectable()
export class ReminderSchedulerService {
  constructor(
    @InjectQueue(QUEUE.NOTIFICATIONS) private readonly queue: Queue,
    private readonly reminders: RemindersRepository,
  ) {}

  async schedule(reminder: Pick<ReminderRow, 'id' | 'remindAt' | 'status' | 'jobId'>): Promise<void> {
    if (reminder.status !== 'pending') {
      await this.unschedule(reminder.id);
      return;
    }
    const jobId = JobId.reminder(reminder.id);
    await upsertJob<ReminderJob>(
      this.queue,
      JOB.REMINDER,
      { reminderId: reminder.id, remindAt: reminder.remindAt.toISOString() },
      { jobId, delay: Math.max(0, reminder.remindAt.getTime() - Date.now()) },
    );
    if (reminder.jobId !== jobId) await this.reminders.update(reminder.id, { jobId });
  }

  unschedule(reminderId: string): Promise<boolean> {
    return removeJob(this.queue, JobId.reminder(reminderId));
  }
}
