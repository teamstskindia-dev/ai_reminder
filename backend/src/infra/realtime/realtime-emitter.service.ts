import { Inject, Injectable, Logger } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.constants';

export const REALTIME_NAMESPACE = '/realtime';
export const userRoom = (userId: string) => `user:${userId}`;

export type RealtimeEvent = 'notification:new' | 'meeting:updated' | 'reminder:fired';

/**
 * Emits Socket.IO events through Redis so every process (api, worker, bot) can reach
 * clients connected to any API replica (which use the Redis adapter).
 */
@Injectable()
export class RealtimeEmitter {
  private readonly logger = new Logger(RealtimeEmitter.name);
  private readonly emitter: Emitter;

  constructor(@Inject(REDIS) redis: Redis) {
    this.emitter = new Emitter(redis).of(REALTIME_NAMESPACE);
  }

  toUser(userId: string, event: RealtimeEvent, payload: unknown): void {
    try {
      this.emitter.to(userRoom(userId)).emit(event, payload);
    } catch (err) {
      this.logger.warn(`emit ${event} failed: ${(err as Error).message}`);
    }
  }
}
