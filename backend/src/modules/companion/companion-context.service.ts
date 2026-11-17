import { Injectable } from '@nestjs/common';
import type { LanguageStyle } from '../../common/types/api.types';
import { formatTime, safeTimeZone } from '../../common/utils/time.util';
import type { UserSettingsRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { toCaptureInsights } from '../ai/capture-insights.service';
import { overlappingIds } from '../meetings/overlap.util';
import type { DaySummary } from './companion.copy';
import { atLocalTime } from './rhythm.util';

type ProfileRow = Prisma.UserProfileGetPayload<object>;

export interface CompanionUser {
  userId: string;
  timezone: string;
  /** What the friend calls them: the preferred name from onboarding, else the first name. */
  name: string | null;
  lang: LanguageStyle;
  settings: UserSettingsRow;
  profile: ProfileRow | null;
}

export interface DayFacts extends DaySummary {
  meetingList: { id: string; title: string; startAt: Date; endAt: Date | null; status: string }[];
  openTitles: string[];
  /** Reminders marked done and to-dos completed during the day. */
  doneTitles: string[];
  /** Reminders from the day's recorded conversations the friend is still unsure about (not reviewed). */
  unconfirmedTitles: string[];
}

const LANGS: LanguageStyle[] = ['english', 'hinglish', 'mixed'];

function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : null;
}

/** Shared lookups for the daily rhythm: who the user is, how they talk, and what a local day holds. */
@Injectable()
export class CompanionContextService {
  constructor(private readonly prisma: PrismaService) {}

  async user(userId: string): Promise<CompanionUser | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, status: true, timezone: true, settings: true, profile: true },
    });
    if (!row || row.status !== 'active' || !row.settings) return null;
    const lang = row.profile?.languageStyle as LanguageStyle | undefined;
    return {
      userId: row.id,
      timezone: safeTimeZone(row.timezone),
      name: row.profile?.preferredName || firstName(row.name),
      lang: lang && LANGS.includes(lang) ? lang : 'english',
      settings: row.settings,
      profile: row.profile,
    };
  }

  /** Meetings, reminders and open to-dos of a local day (YYYY-MM-DD). */
  async day(userId: string, timezone: string, day: string): Promise<DayFacts> {
    const start = atLocalTime(day, timezone, '00:00');
    const end = new Date(start.getTime() + 24 * 3600_000);
    const [meetingList, reminders, openItems, openRows, doneReminders, doneItems, captureReports] = await Promise.all([
      this.prisma.meeting.findMany({
        where: {
          userId,
          startAt: { gte: start, lt: end },
          status: { notIn: ['cancelled'] },
          source: { not: 'capture' },
        },
        orderBy: { startAt: 'asc' },
        select: { id: true, title: true, startAt: true, endAt: true, status: true },
        take: 20,
      }),
      this.prisma.reminder.count({
        where: { userId, remindAt: { gte: start, lt: end }, status: { in: ['pending', 'sent'] } },
      }),
      this.prisma.actionItem.count({ where: { userId, status: 'open' } }),
      this.prisma.actionItem.findMany({
        where: { userId, status: 'open' },
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        select: { title: true },
        take: 5,
      }),
      this.prisma.reminder.findMany({
        where: { userId, doneAt: { gte: start, lt: end } },
        select: { title: true },
        take: 10,
      }),
      this.prisma.actionItem.findMany({
        where: { userId, status: 'done', completedAt: { gte: start, lt: end } },
        select: { title: true },
        take: 10,
      }),
      this.prisma.meetingReport.findMany({
        where: { userId, meeting: { source: 'capture', startAt: { gte: start, lt: end }, reviewedAt: null } },
        select: { insights: true },
        take: 10,
      }),
    ]);
    return {
      meetings: meetingList.length,
      overlaps: overlappingIds(meetingList).length,
      firstMeetingAt: meetingList[0] ? formatTime(meetingList[0].startAt, timezone) : null,
      reminders,
      openItems,
      meetingList,
      openTitles: openRows.map((r) => r.title),
      doneTitles: [...new Set([...doneReminders, ...doneItems].map((r) => r.title))],
      unconfirmedTitles: captureReports
        .flatMap((r) => toCaptureInsights(r.insights)?.suggestions ?? [])
        .filter((sg) => sg.status === 'open')
        .map((sg) => sg.title)
        .slice(0, 5),
    };
  }

  /** The profile as plain text for prompts (only what the user shared). */
  profileText(u: CompanionUser): string {
    const p = u.profile;
    if (!p) return '(nothing yet)';
    const facts = Array.isArray(p.facts) ? p.facts.filter((f): f is string => typeof f === 'string') : [];
    const lines = [
      p.preferredName && `Name: ${p.preferredName}`,
      p.occupation && `Does: ${p.occupation}`,
      p.currentFocus && `On their mind lately: ${p.currentFocus}`,
      p.communicationStyle && `Likes to be talked to: ${p.communicationStyle}`,
      p.tone && `Vibe: ${p.tone}`,
      p.summary && `Summary: ${p.summary}`,
      facts.length ? `Facts: ${facts.slice(0, 12).join('; ')}` : null,
    ].filter(Boolean);
    return lines.length ? lines.join('\n') : '(nothing yet)';
  }

  /** The day as plain text for prompts. */
  dayText(facts: DayFacts, timezone: string): string {
    const lines = [
      facts.meetingList.length
        ? `Meetings: ${facts.meetingList.map((m) => `${m.title} at ${formatTime(m.startAt, timezone)}`).join('; ')}`
        : 'Meetings: none',
      facts.doneTitles.length ? `Got done: ${facts.doneTitles.join('; ')}` : 'Got done: nothing recorded',
      facts.openTitles.length
        ? `Still open (${facts.openItems}): ${facts.openTitles.join('; ')}`
        : 'Still open: nothing',
      facts.unconfirmedTitles.length
        ? `From today's recorded conversations, not confirmed yet (ask gently whether and when to remind): ${facts.unconfirmedTitles.join('; ')}`
        : null,
    ].filter(Boolean);
    return lines.join('\n');
  }
}
