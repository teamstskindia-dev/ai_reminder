import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { callExternal } from '../../infra/external/external-call';
import { CacheService } from '../../infra/redis/cache.service';

/**
 * Single place that invalidates cached content/config after an admin write:
 * deletes `cfg:*` in Redis and pings the website's on-demand revalidation endpoint (best effort).
 */
@Injectable()
export class ContentCacheService {
  private readonly logger = new Logger(ContentCacheService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly config: AppConfig,
  ) {}

  async invalidate(scope = 'all'): Promise<number> {
    const flushed = await this.cache.delPattern('cfg:*');
    this.logger.log(`Content cache invalidated (${scope}): ${flushed} keys`);
    void this.revalidateWeb();
    return flushed;
  }

  private async revalidateWeb(): Promise<void> {
    const { url, secret } = this.config.revalidate;
    if (!url) return;
    try {
      await callExternal(
        { provider: 'webhook', operation: 'web.revalidate', retries: 1, timeoutMs: 3000 },
        async (signal) => {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret ?? '' },
            body: JSON.stringify({ tags: ['config'] }),
            signal,
          });
          if (!res.ok) throw Object.assign(new Error(`revalidate responded ${res.status}`), { status: res.status });
        },
      );
    } catch {
      this.logger.warn({ provider: 'webhook' }, 'web revalidation failed (cache still invalidated)');
    }
  }
}
