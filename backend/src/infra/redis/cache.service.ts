import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from './redis.constants';

/** JSON cache on Redis. Every operation is fail-open: a Redis outage never breaks a request. */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`cache get ${key} failed: ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`cache set ${key} failed: ${(err as Error).message}`);
    }
  }

  async wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await loader();
    if (value !== null && value !== undefined) await this.set(key, value, ttlSeconds);
    return value;
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.redis.del(...keys);
    } catch (err) {
      this.logger.warn(`cache del failed: ${(err as Error).message}`);
    }
  }

  /** Deletes every key matching a glob pattern using SCAN (non-blocking). Returns the number deleted. */
  async delPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    try {
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length) deleted += await this.redis.unlink(...keys);
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(`cache delPattern ${pattern} failed: ${(err as Error).message}`);
    }
    return deleted;
  }
}
