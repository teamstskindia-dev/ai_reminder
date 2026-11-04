import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/pagination/pagination';
import type { FailedJob, QueueName, QueueStats } from '../../common/types/api.types';
import { QUEUE_NAMES } from '../../common/types/api.types';
import { QUEUE } from '../../infra/queue/queue.constants';

/** Strips anything sensitive from job payloads shown in the admin panel. */
function safeJobData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    out[k] = /token|secret|password|vars|body/i.test(k) ? '[omitted]' : v;
  }
  return out;
}

/** Admin → System: queue counts, failed jobs and retries. */
@Injectable()
export class QueueAdminService {
  private readonly queues: Record<QueueName, Queue>;

  constructor(
    @InjectQueue(QUEUE.CALENDAR_SYNC) sync: Queue,
    @InjectQueue(QUEUE.MEETING_BOT) bot: Queue,
    @InjectQueue(QUEUE.BOT_EVENTS) botEvents: Queue,
    @InjectQueue(QUEUE.AI) ai: Queue,
    @InjectQueue(QUEUE.NOTIFICATIONS) notifications: Queue,
    @InjectQueue(QUEUE.DIGEST) digest: Queue,
  ) {
    this.queues = {
      'calendar-sync': sync,
      'meeting-bot': bot,
      'bot-events': botEvents,
      'ai-processing': ai,
      notifications,
      digest,
    };
  }

  private queue(name: string): Queue {
    if (!(QUEUE_NAMES as readonly string[]).includes(name)) throw AppException.notFound('Queue');
    return this.queues[name as QueueName];
  }

  async stats(): Promise<QueueStats[]> {
    return Promise.all(
      QUEUE_NAMES.map(async (name) => {
        const q = this.queues[name];
        const [counts, paused] = await Promise.all([
          q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'prioritized'),
          q.isPaused(),
        ]);
        return {
          name,
          waiting: (counts.waiting ?? 0) + (counts.prioritized ?? 0),
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          completed: counts.completed ?? 0,
          paused,
        };
      }),
    );
  }

  async failed(name: string, page: number, limit: number): Promise<Paginated<FailedJob>> {
    const q = this.queue(name);
    const start = (page - 1) * limit;
    const [jobs, total] = await Promise.all([q.getFailed(start, start + limit - 1), q.getJobCountByTypes('failed')]);
    return Paginated.of(
      jobs.map((j) => ({
        id: String(j.id ?? ''),
        name: j.name,
        failedReason: (j.failedReason ?? '').slice(0, 500),
        attemptsMade: j.attemptsMade,
        timestamp: j.timestamp,
        data: safeJobData(j.data),
      })),
      total,
      page,
      limit,
    );
  }

  async retryFailed(name: string): Promise<{ retried: number }> {
    const q = this.queue(name);
    const count = await q.getJobCountByTypes('failed');
    await q.retryJobs({ state: 'failed', count: 1000 });
    return { retried: count };
  }
}
