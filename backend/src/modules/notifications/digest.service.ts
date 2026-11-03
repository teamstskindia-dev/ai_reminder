import { Injectable, Logger } from '@nestjs/common';
import { escapeMarkdown } from '../../common/utils/template.util';
import { formatLongDate, formatTime, startOfLocalDay, zonedParts } from '../../common/utils/time.util';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SettingsService } from '../content/settings.service';
import { UsersRepository } from '../users/users.repository';
import { DeliveryService } from './delivery.service';

const PAGE = 500;

/** Hourly fan-out: users whose local hour equals their `digest_hour` get the daily digest. */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryService,
    private readonly settings: SettingsService,
  ) {}

  async run(now = new Date()): Promise<{ candidates: number; sent: number }> {
    const notif = await this.settings.get('notifications');
    if (!notif.digestEnabled) return { candidates: 0, sent: 0 };
    let cursor: string | null = null;
    let candidates = 0;
    let sent = 0;
    for (;;) {
      const page = await this.users.listDigestCandidates(cursor, PAGE);
      if (!page.length) break;
      for (const c of page) {
        if (zonedParts(now, c.user.timezone).hour !== c.digestHour) continue;
        candidates++;
        try {
          if (await this.sendDigest(c.userId, c.user.timezone, now)) sent++;
        } catch (err) {
          this.logger.warn({ userId: c.userId, errName: (err as Error).name }, 'digest failed for user');
        }
      }
      cursor = page[page.length - 1].userId;
      if (page.length < PAGE) break;
    }
    this.logger.log({ candidates, sent }, 'digest run finished');
    return { candidates, sent };
  }

  private async sendDigest(userId: string, tz: string, now: Date): Promise<boolean> {
    const dayStart = startOfLocalDay(now, tz);
    const dayEnd = startOfLocalDay(now, tz, 1);
    const [meetings, openCount, items, reminders] = await Promise.all([
      this.prisma.meeting.findMany({
        where: { userId, startAt: { gte: dayStart, lt: dayEnd }, status: { notIn: ['cancelled'] } },
        orderBy: { startAt: 'asc' },
        select: { title: true, startAt: true },
        take: 20,
      }),
      this.prisma.actionItem.count({ where: { userId, status: 'open' } }),
      this.prisma.actionItem.findMany({
        where: { userId, status: 'open' },
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        select: { title: true, dueAt: true },
        take: 5,
      }),
      this.prisma.reminder.count({ where: { userId, status: 'pending', remindAt: { gte: dayStart, lt: dayEnd } } }),
    ]);
    if (!meetings.length && !openCount && !reminders) return false;

    const lines: string[] = [];
    if (meetings.length) {
      lines.push('**Meetings today**');
      for (const m of meetings) lines.push(`- ${formatTime(m.startAt, tz)} · ${escapeMarkdown(m.title)}`);
      lines.push('');
    }
    if (items.length) {
      lines.push(`**Open action items (${openCount})**`);
      for (const i of items) {
        lines.push(
          `- ${escapeMarkdown(i.title)}${i.dueAt ? ` (due ${formatTime(i.dueAt, tz)} ${formatLongDate(i.dueAt, tz)})` : ''}`,
        );
      }
      lines.push('');
    }
    if (reminders) lines.push(`You have ${reminders} reminder(s) scheduled today.`);

    const first = meetings[0];
    const res = await this.delivery.deliver({
      userId,
      type: 'daily_digest',
      templateKey: 'daily_digest',
      vars: {
        meetingCount: meetings.length,
        actionItemCount: openCount,
        firstMeeting: first ? `First up: ${first.title} at ${formatTime(first.startAt, tz)}` : 'No meetings today',
        date: formatLongDate(now, tz),
        digestMarkdown: lines.join('\n'),
      },
      data: { url: '/dashboard' },
    });
    return res.delivered.length > 0;
  }
}
