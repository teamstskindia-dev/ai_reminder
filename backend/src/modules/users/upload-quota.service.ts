import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';
import { UsersRepository } from './users.repository';

/** Kept a little past the month so the counter of the month just ended can still be read. */
const COUNTER_TTL_SECONDS = 40 * 86_400;
/** Uploaded transcripts are parsed, not transcribed, so they cost no audio minutes. */
const TRANSCRIPT_EXTENSIONS = ['.txt', '.vtt', '.srt'];

/** UTC month key ("2026-11"); plan limits are counted per UTC calendar month. */
export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** "1 minute" / "12 minutes" for limit messages. */
function minutes(n: number): string {
  return `${n} minute${n === 1 ? '' : 's'}`;
}

/**
 * The plan's `uploadMinutesPerMonth` (null = unlimited) for audio we transcribe: meeting uploads and recorded
 * conversations. Seconds used are counted in Redis per user and UTC month, and are charged when the audio is
 * accepted for transcription, so deleting a recording afterwards does not give the minutes back (the
 * transcription was already paid for).
 */
@Injectable()
export class UploadQuotaService {
  constructor(
    private readonly users: UsersRepository,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** The plan limit in seconds, or null when the plan has no upload limit. */
  async limitSeconds(userId: string): Promise<number | null> {
    const limits = await this.users.planLimits(userId);
    return limits.uploadMinutesPerMonth === null ? null : limits.uploadMinutesPerMonth * 60;
  }

  async usedSeconds(userId: string, now = new Date()): Promise<number> {
    return Number((await this.redis.get(RedisKeys.uploadQuota(userId, monthKey(now)))) ?? 0);
  }

  /**
   * Before audio of unknown length is accepted (a meeting upload, or a part of a recording): refuses once this
   * month's minutes are used up. An audio upload is also refused while another one is still being transcribed,
   * because its minutes are only known (and charged) after transcription; otherwise many files sent at once
   * would all pass this check.
   */
  async assertCanUpload(userId: string, opts: { checkPendingUploads?: boolean } = {}): Promise<void> {
    const limit = await this.limitSeconds(userId);
    if (limit === null) return;
    if ((await this.usedSeconds(userId)) >= limit) {
      throw AppException.planLimit(
        `You've used all ${minutes(limit / 60)} of audio your plan allows this month. Upgrade your plan to upload more.`,
      );
    }
    if (opts.checkPendingUploads) {
      const pending = await this.prisma.meeting.count({
        where: {
          userId,
          source: 'upload',
          status: 'processing',
          durationSeconds: null,
          recordingPath: { not: null },
          NOT: TRANSCRIPT_EXTENSIONS.map((ext) => ({ recordingPath: { endsWith: ext } })),
        },
      });
      if (pending > 0) {
        throw AppException.planLimit(
          'Your previous audio upload is still being processed. Please wait for it to finish before uploading more.',
        );
      }
    }
  }

  /**
   * Charges a recording of known length (a finished recorded conversation). Refused, and nothing charged, when
   * it does not fit in what is left of this month's minutes. Returns a function that gives the seconds back
   * (when the recording could not be queued after all).
   */
  async consume(userId: string, seconds: number): Promise<() => Promise<void>> {
    const limit = await this.limitSeconds(userId);
    const key = RedisKeys.uploadQuota(userId, monthKey(new Date()));
    const charge = Math.max(0, Math.round(seconds));
    const used = await this.incrBy(key, charge);
    if (limit !== null && used > limit) {
      await this.redis.decrby(key, charge);
      const left = Math.max(0, Math.floor((limit - (used - charge)) / 60));
      throw AppException.planLimit(
        left > 0
          ? `This recording is longer than the ${minutes(left)} of audio left on your plan this month. Upgrade your plan to send it.`
          : `You've used all ${minutes(limit / 60)} of audio your plan allows this month. Upgrade your plan to send this recording.`,
      );
    }
    return async () => {
      await this.redis.decrby(key, charge);
    };
  }

  /**
   * Records seconds already transcribed (an uploaded file, whose length is only known afterwards). Never
   * refuses: the work is done; the next upload is blocked by `assertCanUpload` if the month is now used up.
   */
  async record(userId: string, seconds: number): Promise<void> {
    await this.incrBy(RedisKeys.uploadQuota(userId, monthKey(new Date())), Math.max(0, Math.round(seconds)));
  }

  /** INCRBY with the expiry set atomically when the counter is created (see incrWithTtl). */
  private async incrBy(key: string, by: number): Promise<number> {
    const results = await this.redis.multi().set(key, '0', 'EX', COUNTER_TTL_SECONDS, 'NX').incrby(key, by).exec();
    const incr = results?.[1];
    if (!incr) throw new Error('Redis transaction was aborted');
    const [err, value] = incr;
    if (err) throw err;
    return Number(value);
  }
}
