import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { TodayBrief, TodayCheckinStatus } from '../../common/types/api.types';
import { formatTime, zonedParts } from '../../common/utils/time.util';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActionItemsService } from '../action-items/action-items.service';
import { MEETING_LIST_INCLUDE, toMeetingListItem } from '../meetings/meetings.mapper';
import { REMINDER_INCLUDE, toReminder } from '../reminders/reminders.mapper';
import { CompanionContextService } from './companion-context.service';
import { dayHeadline, greeting } from './companion.copy';
import { NudgeService } from './nudge.service';
import { atLocalTime, dateOnly, dayKey, localMinutes, toMinutes } from './rhythm.util';

/**
 * The Today screen (user-flow §03): a greeting in the user's vibe, one line about the day, today's
 * meetings, reminders that still need them, open promises, the evening check-in state and any nudge.
 */
@Injectable()
export class TodayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: CompanionContextService,
    private readonly actionItems: ActionItemsService,
    private readonly nudges: NudgeService,
  ) {}

  async build(userId: string): Promise<TodayBrief> {
    const user = await this.context.user(userId);
    if (!user) throw AppException.notFound('User');
    const now = new Date();
    const tz = user.timezone;
    const day = dayKey(now, tz);
    const start = atLocalTime(day, tz, '00:00');
    const end = new Date(start.getTime() + 24 * 3600_000);

    const [meetings, reminders, openItems, openCount, checkin, nudge] = await Promise.all([
      this.prisma.meeting.findMany({
        where: { userId, startAt: { gte: start, lt: end }, status: { notIn: ['cancelled'] } },
        include: MEETING_LIST_INCLUDE,
        orderBy: { startAt: 'asc' },
        take: 10,
      }),
      this.prisma.reminder.findMany({
        where: { userId, remindAt: { gte: start, lt: end }, status: { in: ['pending', 'sent'] } },
        include: REMINDER_INCLUDE,
        orderBy: { remindAt: 'asc' },
        take: 20,
      }),
      this.actionItems.openSoonest(userId, 5),
      this.prisma.actionItem.count({ where: { userId, status: 'open' } }),
      this.prisma.dailyCheckin.findUnique({
        where: { userId_localDate: { userId, localDate: dateOnly(day) } },
        select: { status: true, mood: true },
      }),
      this.nudges.current(userId, tz),
    ]);

    const s = user.settings;
    let checkinStatus: TodayCheckinStatus;
    if (checkin) checkinStatus = checkin.status as TodayCheckinStatus;
    else if (!s.eveningCheckin) checkinStatus = 'off';
    else checkinStatus = localMinutes(now, tz) >= (toMinutes(s.checkinTime) ?? 1260) ? 'due' : 'upcoming';

    return {
      date: day,
      languageStyle: user.lang,
      greeting: greeting(user.lang, user.name, zonedParts(now, tz).hour),
      headline: dayHeadline(user.lang, {
        meetings: meetings.length,
        firstMeetingAt: meetings[0] ? formatTime(meetings[0].startAt, tz) : null,
        reminders: reminders.length,
        openItems: openCount,
      }),
      counts: { meetings: meetings.length, reminders: reminders.length, openItems: openCount },
      meetings: meetings.map(toMeetingListItem),
      reminders: reminders.map(toReminder),
      openItems,
      checkin: { time: s.checkinTime, status: checkinStatus, mood: checkin?.mood ?? null },
      nudge,
    };
  }
}
