import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { safeTimeZone } from '../../common/utils/time.util';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { addJob } from '../../infra/queue/job-utils';
import { JOB, JobId, QUEUE, RhythmJob } from '../../infra/queue/queue.constants';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';
import { dueDay, isDue, localMinutes, weekday } from './rhythm.util';

const PAGE = 500;
/** Night learning runs at this local time. */
export const NIGHTLY_TIME = '03:00';
/** The weekly recap goes out on Sunday at this local time. */
export const RECAP_TIME = '18:00';
const MARKER_TTL_SECONDS = 2 * 86_400;

interface RhythmCandidate {
  userId: string;
  wakeTime: string;
  checkinTime: string;
  morningBrief: boolean;
  eveningCheckin: boolean;
  user: { timezone: string };
}

type RhythmKind = typeof JOB.MORNING_BRIEF | typeof JOB.EVENING_CHECKIN | typeof JOB.NIGHTLY | typeof JOB.WEEKLY_RECAP;

/**
 * Every 5 minutes: finds users whose wake time, check-in time, night-learning time or Sunday recap time
 * just passed (in their own time zone) and enqueues one job each. A Redis marker per user, kind and
 * local day makes this exactly-once even though the due window spans several ticks.
 */
@Injectable()
export class RhythmService {
  private readonly logger = new Logger(RhythmService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE.COMPANION) private readonly queue: Queue,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async tick(now = new Date()): Promise<Record<RhythmKind, number>> {
    const queued: Record<RhythmKind, number> = {
      [JOB.MORNING_BRIEF]: 0,
      [JOB.EVENING_CHECKIN]: 0,
      [JOB.NIGHTLY]: 0,
      [JOB.WEEKLY_RECAP]: 0,
    };
    let cursor: string | null = null;
    for (;;) {
      const page: RhythmCandidate[] = await this.prisma.userSettings.findMany({
        where: {
          user: { status: 'active', onboardedAt: { not: null } },
          ...(cursor ? { userId: { gt: cursor } } : {}),
        },
        select: {
          userId: true,
          wakeTime: true,
          checkinTime: true,
          morningBrief: true,
          eveningCheckin: true,
          user: { select: { timezone: true } },
        },
        orderBy: { userId: 'asc' },
        take: PAGE,
      });
      for (const s of page) {
        const tz = safeTimeZone(s.user.timezone);
        const nowMin = localMinutes(now, tz);
        const due: [RhythmKind, string][] = [];
        if (s.morningBrief && isDue(nowMin, s.wakeTime)) due.push([JOB.MORNING_BRIEF, s.wakeTime]);
        if (s.eveningCheckin && isDue(nowMin, s.checkinTime)) due.push([JOB.EVENING_CHECKIN, s.checkinTime]);
        if (isDue(nowMin, NIGHTLY_TIME)) due.push([JOB.NIGHTLY, NIGHTLY_TIME]);
        if (weekday(now, tz) === 'Sun' && isDue(nowMin, RECAP_TIME)) due.push([JOB.WEEKLY_RECAP, RECAP_TIME]);
        for (const [kind, time] of due) {
          if (await this.enqueue(kind, s.userId, dueDay(now, tz, time))) queued[kind]++;
        }
      }
      if (page.length < PAGE) break;
      cursor = page[page.length - 1].userId;
    }
    if (Object.values(queued).some(Boolean)) this.logger.log(queued, 'rhythm jobs queued');
    return queued;
  }

  private async enqueue(kind: RhythmKind, userId: string, day: string): Promise<boolean> {
    const first = await this.redis.set(RedisKeys.rhythm(kind, userId, day), '1', 'EX', MARKER_TTL_SECONDS, 'NX');
    if (first !== 'OK') return false;
    await addJob<RhythmJob>(this.queue, kind, { userId, day }, { jobId: JobId.rhythm(kind, userId, day) });
    return true;
  }
}
