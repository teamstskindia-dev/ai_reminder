import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppException } from '../../common/errors/app.exception';
import { ApiDataResponse, ApiErrors } from '../../common/swagger/api-docs.decorators';
import type { AnalyticsOverview } from '../../common/types/api.types';
import { parseLocalDate, safeTimeZone, startOfLocalDay } from '../../common/utils/time.util';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { SettingsService } from '../content/settings.service';
import { AnalyticsOverview as AnalyticsOverviewModel, AnalyticsQueryDto } from './analytics.dto';

/** Resolves the [from, to) window in the user's time zone. */
export function resolveRange(q: AnalyticsQueryDto, tz: string, now = new Date()): { from: Date; to: Date } {
  if (q.from || q.to) {
    if (!q.from || !q.to)
      throw AppException.validation([
        { field: q.from ? 'to' : 'from', messages: ['from and to must be used together'] },
      ]);
    const from = q.from.length === 10 ? parseLocalDate(q.from, tz) : new Date(q.from);
    const toDay = q.to.length === 10 ? parseLocalDate(q.to, tz) : new Date(q.to);
    if (!from || !toDay || Number.isNaN(from.getTime()) || Number.isNaN(toDay.getTime())) {
      throw AppException.validation([{ field: 'from', messages: ['invalid date'] }]);
    }
    const to = q.to.length === 10 ? startOfLocalDay(toDay, tz, 1) : toDay;
    if (to.getTime() <= from.getTime())
      throw AppException.validation([{ field: 'to', messages: ['to must be after from'] }]);
    if (to.getTime() - from.getTime() > 366 * 86_400_000) {
      throw AppException.validation([{ field: 'from', messages: ['the range can be at most 366 days'] }]);
    }
    return { from, to };
  }
  const days = q.range === '7d' ? 7 : q.range === '90d' ? 90 : 30;
  return { from: startOfLocalDay(now, tz, -(days - 1)), to: now };
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async overview(userId: string, q: AnalyticsQueryDto): Promise<AnalyticsOverview> {
    const features = await this.settings.get('features');
    if (!features.analytics) throw AppException.forbidden('Analytics is disabled');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const tz = safeTimeZone(user?.timezone);
    const { from, to } = resolveRange(q, tz);
    const rows = await this.prisma.$queryRaw<{ data: Omit<AnalyticsOverview, 'range'> }[]>(
      Prisma.sql`select public.analytics_overview(${userId}::uuid, ${from}::timestamptz, ${to}::timestamptz, ${tz}) as data`,
    );
    return { range: { from: from.toISOString(), to: to.toISOString() }, ...rows[0].data };
  }
}

@ApiTags('analytics')
@UserAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Get meeting analytics for a date range',
    description: 'Totals, daily series, sentiment, top topics and participants, and meetings by hour of day.',
  })
  @ApiDataResponse(AnalyticsOverviewModel)
  @ApiErrors('FORBIDDEN')
  overview(@CurrentUserId() userId: string, @Query() q: AnalyticsQueryDto) {
    return this.analytics.overview(userId, q);
  }
}
