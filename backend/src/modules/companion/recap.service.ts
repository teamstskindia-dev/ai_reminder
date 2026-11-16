import { Injectable, Logger } from '@nestjs/common';
import type { MoodPoint, WeeklyRecap } from '../../common/types/api.types';
import { escapeMarkdown } from '../../common/utils/template.util';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SettingsService } from '../content/settings.service';
import { DeliveryService } from '../notifications/delivery.service';
import { CompanionContextService } from './companion-context.service';
import { recapHeadline } from './companion.copy';
import { addDays, atLocalTime, dateOnly, weekday } from './rhythm.util';

const MOOD_EMOJI = ['', '😞', '😕', '😐', '🙂', '😄'];

const avg = (values: (number | null)[]): number | null => {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

function isRecap(value: unknown): value is WeeklyRecap {
  return !!value && typeof value === 'object' && typeof (value as WeeklyRecap).weekStart === 'string';
}

/** Sunday-evening weekly recap (user-flow §03): highlights, promises kept, mood trend, people you met. */
@Injectable()
export class RecapService {
  private readonly logger = new Logger(RecapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: CompanionContextService,
    private readonly delivery: DeliveryService,
    private readonly settings: SettingsService,
  ) {}

  /** Worker: builds, stores and sends the recap for the week starting `weekStart` (Monday). Once per week. */
  async send(userId: string, weekStart: string): Promise<'sent' | 'skipped'> {
    const user = await this.context.user(userId);
    if (!user) return 'skipped';
    const existing = await this.prisma.weeklyRecap.findUnique({
      where: { userId_weekStart: { userId, weekStart: dateOnly(weekStart) } },
    });
    if (existing) return 'skipped';
    const recap = await this.build(userId, user.timezone, user.name, weekStart);
    const quiet =
      !recap.meetings.count && !recap.promises.kept && !recap.promises.remindersDone && !recap.mood.checkins;
    if (quiet) return 'skipped';
    try {
      await this.prisma.weeklyRecap.create({
        data: { userId, weekStart: dateOnly(weekStart), data: recap as unknown as Prisma.InputJsonValue },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'skipped';
      throw err;
    }
    const branding = await this.settings.get('branding');
    await this.delivery.deliver({
      userId,
      type: 'weekly_recap',
      templateKey: 'weekly_recap',
      vars: {
        headline: recap.headline,
        preview: this.preview(recap),
        appName: branding.appName,
        recapMarkdown: this.markdown(recap, user.name, user.timezone),
      },
      data: { url: '/recap' },
    });
    this.logger.log({ userId, weekStart }, 'weekly recap sent');
    return 'sent';
  }

  /** The user's recaps, newest first. */
  async list(userId: string, limit: number): Promise<WeeklyRecap[]> {
    const rows = await this.prisma.weeklyRecap.findMany({
      where: { userId },
      orderBy: { weekStart: 'desc' },
      take: limit,
    });
    return rows.map((r) => r.data as unknown).filter(isRecap);
  }

  async build(userId: string, timezone: string, userName: string | null, weekStart: string): Promise<WeeklyRecap> {
    const start = atLocalTime(weekStart, timezone, '00:00');
    const end = atLocalTime(addDays(weekStart, 7), timezone, '00:00');
    const range = { gte: start, lt: end };

    const [meetings, kept, remindersDone, stillOpen, checkins, prevCheckins, participants] = await Promise.all([
      this.prisma.meeting.findMany({
        where: { userId, startAt: range, status: { notIn: ['cancelled', 'scheduled', 'skipped', 'failed'] } },
        select: {
          id: true,
          title: true,
          startAt: true,
          endAt: true,
          durationSeconds: true,
          report: { select: { meetingScore: true } },
        },
        orderBy: { startAt: 'asc' },
        take: 200,
      }),
      this.prisma.actionItem.count({ where: { userId, status: 'done', completedAt: range } }),
      this.prisma.reminder.count({ where: { userId, doneAt: range } }),
      this.prisma.actionItem.count({ where: { userId, status: 'open' } }),
      this.prisma.dailyCheckin.findMany({
        where: { userId, localDate: { gte: dateOnly(weekStart), lt: dateOnly(addDays(weekStart, 7)) } },
        select: { localDate: true, mood: true, energy: true, status: true },
      }),
      this.prisma.dailyCheckin.findMany({
        where: { userId, localDate: { gte: dateOnly(addDays(weekStart, -7)), lt: dateOnly(weekStart) } },
        select: { mood: true },
      }),
      this.prisma.meetingParticipant.findMany({
        where: { meeting: { userId, startAt: range } },
        select: { name: true },
        take: 500,
      }),
    ]);

    const seconds = meetings.reduce(
      (sum, m) => sum + (m.durationSeconds ?? (m.endAt ? (m.endAt.getTime() - m.startAt.getTime()) / 1000 : 0)),
      0,
    );
    const highlights = [...meetings]
      .sort((a, b) => Number(b.report?.meetingScore ?? -1) - Number(a.report?.meetingScore ?? -1))
      .slice(0, 3)
      .map((m) => ({ id: m.id, title: m.title, startAt: m.startAt.toISOString() }));

    const byDay = new Map(checkins.map((c) => [c.localDate.toISOString().slice(0, 10), c]));
    const days: MoodPoint[] = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const c = byDay.get(date);
      return { date, mood: c?.mood ?? null, energy: c?.energy ?? null };
    });
    const average = avg(days.map((d) => d.mood));
    const previous = avg(prevCheckins.map((c) => c.mood));
    const trend =
      average === null || previous === null
        ? null
        : average - previous >= 0.3
          ? 'up'
          : previous - average >= 0.3
            ? 'down'
            : 'flat';

    const self = userName?.toLowerCase();
    const counts = new Map<string, number>();
    for (const p of participants) {
      const name = p.name.trim();
      if (!name || name.toLowerCase() === self || /^speaker \d+$/i.test(name)) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const people = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);

    return {
      weekStart,
      weekEnd: addDays(weekStart, 6),
      headline: recapHeadline(meetings.length, kept + remindersDone),
      meetings: { count: meetings.length, hours: Math.round((seconds / 3600) * 10) / 10, highlights },
      promises: { kept, remindersDone, stillOpen },
      mood: { days, average, trend, checkins: checkins.filter((c) => c.status === 'completed').length },
      people,
      createdAt: new Date().toISOString(),
    };
  }

  private preview(r: WeeklyRecap): string {
    const parts: string[] = [];
    const done = r.promises.kept + r.promises.remindersDone;
    if (done) parts.push(`${done} ${done === 1 ? 'thing' : 'things'} done`);
    if (r.mood.trend === 'up') parts.push('mood up this week');
    else if (r.mood.average !== null) parts.push(`average mood ${MOOD_EMOJI[Math.round(r.mood.average)]}`);
    if (r.people.length) parts.push(`you met ${r.people.slice(0, 2).join(' and ')}`);
    return parts.join(' · ') || 'Your week at a glance';
  }

  private markdown(r: WeeklyRecap, name: string | null, timezone: string): string {
    const lines: string[] = [
      `Hi${name ? ` ${escapeMarkdown(name)}` : ''}, here is your week (${r.weekStart} to ${r.weekEnd}).`,
      '',
    ];
    if (r.meetings.count) {
      lines.push(`**Meetings:** ${r.meetings.count} (${r.meetings.hours}h)`);
      for (const h of r.meetings.highlights) {
        lines.push(`- ${escapeMarkdown(h.title)} (${weekday(new Date(h.startAt), timezone)})`);
      }
      lines.push('');
    }
    lines.push(
      `**Promises kept:** ${r.promises.kept} to-dos and ${r.promises.remindersDone} reminders done. ${r.promises.stillOpen} still open.`,
      '',
    );
    if (r.mood.checkins || r.mood.average !== null) {
      const trend =
        r.mood.trend === 'up' ? ', up from last week' : r.mood.trend === 'down' ? ', a bit lower than last week' : '';
      const strip = r.mood.days.map((d) => (d.mood ? MOOD_EMOJI[d.mood] : '·')).join(' ');
      lines.push(`**Mood:** ${strip}${r.mood.average !== null ? ` (average ${r.mood.average}/5${trend})` : ''}`, '');
    }
    if (r.people.length) lines.push(`**People you met:** ${r.people.map(escapeMarkdown).join(', ')}`, '');
    lines.push('Have a good week ahead!');
    return lines.join('\n');
  }
}
