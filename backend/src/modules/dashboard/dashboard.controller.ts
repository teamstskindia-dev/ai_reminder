import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { DashboardHome } from '../../common/types/api.types';
import { safeTimeZone } from '../../common/utils/time.util';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActionItemsService } from '../action-items/action-items.service';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { PublicContentService } from '../content/public-content.service';
import { toMeetingListItem } from '../meetings/meetings.mapper';
import { LIVE_STATUSES, MeetingsRepository } from '../meetings/meetings.repository';
import { RemindersService } from '../reminders/reminders.service';
import { PlatformQueryDto } from '../public/public.controller';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meetings: MeetingsRepository,
    private readonly actionItems: ActionItemsService,
    private readonly reminders: RemindersService,
    private readonly content: PublicContentService,
  ) {}

  async home(userId: string, platform: 'web' | 'mobile'): Promise<DashboardHome> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const tz = safeTimeZone(user?.timezone);
    const now = new Date();
    const [statsRows, upcoming, recent, openItems, reminders, banners] = await Promise.all([
      this.prisma.$queryRaw<{ stats: DashboardHome['stats'] }[]>(
        Prisma.sql`select public.dashboard_home_stats(${userId}::uuid, ${tz}) as stats`,
      ),
      this.meetings.listItems(
        {
          userId,
          status: { in: ['scheduled', ...LIVE_STATUSES] },
          OR: [{ startAt: { gte: now } }, { endAt: { gte: now } }, { status: { in: LIVE_STATUSES } }],
        },
        { startAt: 'asc' },
        5,
      ),
      this.meetings.listItems({ userId, status: 'completed' }, { startAt: 'desc' }, 5),
      this.actionItems.openSoonest(userId, 5),
      this.reminders.upcoming(userId, 5),
      this.content.dashboardBanners(platform),
    ]);
    return {
      stats: statsRows[0]?.stats ?? {
        meetingsThisWeek: 0,
        hoursThisWeek: 0,
        openActionItems: 0,
        pendingReminders: 0,
        avgMeetingScore: null,
      },
      upcomingMeetings: upcoming.map(toMeetingListItem),
      recentReports: recent.map(toMeetingListItem),
      openActionItems: openItems,
      upcomingReminders: reminders,
      banners,
    };
  }
}

@ApiTags('dashboard')
@UserAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('home')
  home(@CurrentUserId() userId: string, @Query() q: PlatformQueryDto) {
    return this.dashboard.home(userId, q.platform);
  }
}
