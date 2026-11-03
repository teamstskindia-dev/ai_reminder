import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { CacheService } from './cache.service';
import { REDIS, redisOptionsFromUrl } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const logger = new Logger('Redis');
        const client = new Redis({
          ...redisOptionsFromUrl(config.redisUrl),
          maxRetriesPerRequest: 2,
          enableOfflineQueue: true,
          retryStrategy: (times) => Math.min(times * 500, 5000),
        });
        let lastError = '';
        client.on('error', (err: Error) => {
          if (err.message !== lastError) logger.warn(`Redis error: ${err.message}`);
          lastError = err.message;
        });
        client.on('ready', () => {
          lastError = '';
          logger.log('Redis connected');
        });
        return client;
      },
    },
    CacheService,
  ],
  exports: [REDIS, CacheService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
