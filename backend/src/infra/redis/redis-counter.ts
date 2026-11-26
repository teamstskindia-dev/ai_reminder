import type { Redis } from 'ioredis';

/**
 * INCR a counter whose expiry is set atomically when it is created.
 *
 * `SET key 0 EX ttl NX` + `INCR key` run in one MULTI, so the key can never be left without a TTL (a crash
 * between a separate INCR and EXPIRE would otherwise lock the subject out forever). The window starts at the
 * first increment and later increments keep the remaining TTL.
 */
export async function incrWithTtl(redis: Redis, key: string, ttlSeconds: number): Promise<number> {
  const results = await redis.multi().set(key, '0', 'EX', ttlSeconds, 'NX').incr(key).exec();
  const incr = results?.[1];
  if (!incr) throw new Error('Redis transaction was aborted');
  const [err, value] = incr;
  if (err) throw err;
  return Number(value);
}
