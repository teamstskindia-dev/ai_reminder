import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiExtension, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthIndicatorService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { MaintenanceExempt, SkipEnvelope } from '../../common/decorators/metadata.decorators';
import { OPENAPI_EXT } from '../../common/swagger/api-docs.decorators';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS } from '../../infra/redis/redis.constants';
import { HealthLive, HealthReady } from './health.dto';

/** Git SHA baked into the image (Docker build-arg GIT_SHA); CI compares it to confirm a Watchtower rollout. */
const VERSION = process.env.REMI_VERSION || 'dev';

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms).unref())]);
}

/** Liveness and readiness. Readiness returns only booleans (no hostnames or error messages). */
@ApiTags('health')
@MaintenanceExempt()
@SkipThrottle()
@ApiExtension(OPENAPI_EXT.noThrottle, true)
@SkipEnvelope()
@Controller('health')
export class HealthController {
  constructor(
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Always 200 while the process is up. Not wrapped in the envelope.',
  })
  @ApiOkResponse({ type: HealthLive })
  live() {
    return { status: 'ok', uptime: Math.round(process.uptime()), version: VERSION };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description: 'Checks Redis and the database (2–3 s timeouts). Returns only booleans. Not wrapped in the envelope.',
  })
  @ApiOkResponse({ type: HealthReady, description: 'Redis and the database are reachable.' })
  @ApiServiceUnavailableResponse({ type: HealthReady, description: 'A dependency is down (`status: "degraded"`).' })
  async ready(@Res({ passthrough: true }) res: Response) {
    const [redisOk, dbOk] = await Promise.all([
      withTimeout(
        this.redis.ping().then((r) => r === 'PONG'),
        2000,
        false,
      ),
      withTimeout(this.prisma.ping(), 3000, false),
    ]);
    const redis = redisOk ? this.indicators.check('redis').up() : this.indicators.check('redis').down();
    const database = dbOk ? this.indicators.check('database').up() : this.indicators.check('database').down();
    const checks = { redis: redis.redis.status === 'up', database: database.database.status === 'up' };
    const healthy = checks.redis && checks.database;
    if (!healthy) res.status(503);
    return { status: healthy ? 'ok' : 'degraded', checks };
  }
}
