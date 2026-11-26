import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { RealtimeEmitter } from '../../infra/realtime/realtime-emitter.service';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';

/**
 * Cuts off a user's access tokens the moment they are suspended or deleted, instead of letting them run until
 * they expire (JWT_ACCESS_TTL_SECONDS, 15 minutes by default). Revoking the refresh sessions alone stops new
 * tokens; this rejects the ones already handed out.
 *
 * Stores the block time; tokens issued at or before it are refused. Tokens issued later (a reactivated user
 * signing in again) are unaffected, so nothing needs to be cleared on reactivation. The key outlives the
 * longest-lived access token and then expires on its own. Live realtime sockets are closed at the same time
 * (a reconnect then fails the same check).
 */
@Injectable()
export class UserAccessBlocklist {
  private readonly logger = new Logger(UserAccessBlocklist.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: AppConfig,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async block(userId: string, at: Date = new Date()): Promise<void> {
    const ttl = this.config.jwt.accessTtlSeconds + 60;
    await this.redis.set(RedisKeys.userBlockedAt(userId), String(Math.floor(at.getTime() / 1000)), 'EX', ttl);
    this.realtime.disconnectUser(userId);
  }

  /**
   * True when a token issued at `issuedAt` (JWT `iat`, seconds) predates the user's block.
   * Fails open when Redis is unreachable: the token is still signature-checked and expires on its own, and
   * failing closed would sign every user out during a Redis outage.
   */
  async isBlocked(userId: string, issuedAt: number | undefined): Promise<boolean> {
    let raw: string | null;
    try {
      raw = await this.redis.get(RedisKeys.userBlockedAt(userId));
    } catch (err) {
      this.logger.warn({ errName: (err as Error).name }, 'could not read the access blocklist; allowing the token');
      return false;
    }
    if (!raw) return false;
    const blockedAt = Number(raw);
    return Number.isFinite(blockedAt) && (issuedAt ?? 0) <= blockedAt;
  }
}
