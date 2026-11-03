import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { REDIS } from '../../infra/redis/redis.constants';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

const SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])
local blocked = redis.call('PTTL', blockKey)
if blocked > 0 then
  return {limit + 1, redis.call('PTTL', hitsKey), 1, blocked}
end
local hits = redis.call('INCR', hitsKey)
if hits == 1 then redis.call('PEXPIRE', hitsKey, ttl) end
local ttlLeft = redis.call('PTTL', hitsKey)
if hits > limit then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  return {hits, ttlLeft, 1, blockDuration}
end
return {hits, ttlLeft, 0, 0}
`;

/** Redis-backed @nestjs/throttler storage (`rl:*` keys) shared by all API replicas. Fails open. */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const res = (await this.redis.eval(
        SCRIPT,
        2,
        `rl:${throttlerName}:${key}`,
        `rl:${throttlerName}:${key}:block`,
        ttl,
        limit,
        blockDuration > 0 ? blockDuration : ttl,
      )) as [number, number, number, number];
      const [totalHits, ttlMs, isBlocked, blockMs] = res;
      return {
        totalHits,
        timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
        isBlocked: isBlocked === 1,
        timeToBlockExpire: Math.max(0, Math.ceil(blockMs / 1000)),
      };
    } catch (err) {
      this.logger.warn(`rate limiter unavailable, allowing request: ${(err as Error).message}`);
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
