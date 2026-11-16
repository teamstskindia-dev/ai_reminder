import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type {
  CheckinReply,
  LanguageStyle,
  CheckinStatus,
  CompanionMessage,
  DailyCheckin,
  MoodPoint,
} from '../../common/types/api.types';
import { formatLongDate } from '../../common/utils/time.util';
import type { DailyCheckinRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DeliveryService } from '../notifications/delivery.service';
import { detectLanguageStyle } from '../onboarding/onboarding.language';
import { CompanionChatService } from './companion-chat.service';
import { CompanionContextService, type CompanionUser } from './companion-context.service';
import {
  checkinClosingFallback,
  checkinFallback,
  checkinOpening,
  checkinPush,
  tomorrowLine,
  type CheckinTone,
} from './companion.copy';
import { addDays, dateOnly, dayKey, dayString } from './rhythm.util';

/** After this many user messages the friend wraps up on its own. */
export const CHECKIN_MAX_TURNS = 3;
const MAX_MESSAGE_CHARS = 1000;

export function toMessages(value: unknown): CompanionMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (m): m is CompanionMessage =>
      !!m &&
      typeof m === 'object' &&
      ((m as CompanionMessage).role === 'user' || (m as CompanionMessage).role === 'assistant') &&
      typeof (m as CompanionMessage).content === 'string',
  );
}

export function toCheckin(row: DailyCheckinRow): DailyCheckin {
  return {
    id: row.id,
    date: dayString(row.localDate),
    status: row.status as CheckinStatus,
    tone: row.tone === 'light' ? 'light' : 'normal',
    messages: toMessages(row.messages),
    mood: row.mood,
    energy: row.energy,
    wins: Array.isArray(row.wins) ? row.wins.filter((w): w is string => typeof w === 'string') : [],
    summary: row.summary,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** How the user writes in this chat wins over the profile (someone may switch to Hinglish later). */
export function chatLanguage(profileLang: LanguageStyle, messages: CompanionMessage[]): LanguageStyle {
  const detected = detectLanguageStyle(messages.filter((m) => m.role === 'user').map((m) => m.content));
  return detected === 'english' ? profileLang : detected;
}

const message = (role: CompanionMessage['role'], content: string): CompanionMessage => ({
  role,
  content,
  at: new Date().toISOString(),
});

/**
 * The evening check-in (user-flow §03): "how did today go?" at the user's check-in time; the friend
 * listens, reflects and celebrates wins, then wraps up with tomorrow's plan and what is still open, and
 * notes mood and energy for the mood timeline. A missed check-in makes the next ask lighter.
 */
@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: CompanionContextService,
    private readonly chat: CompanionChatService,
    private readonly delivery: DeliveryService,
  ) {}

  /** Worker: sends the check-in push for `day` (once), unless the user already checked in. */
  async prompt(userId: string, day: string): Promise<'sent' | 'skipped'> {
    const user = await this.context.user(userId);
    if (!user || !user.settings.eveningCheckin) return 'skipped';
    const existing = await this.prisma.dailyCheckin.findUnique({
      where: { userId_localDate: { userId, localDate: dateOnly(day) } },
    });
    if (existing) return 'skipped';
    const row = await this.create(user, day);
    const push = checkinPush(user.lang, user.name, row.tone as CheckinTone);
    await this.delivery.deliver({
      userId,
      type: 'evening_checkin',
      templateKey: 'evening_checkin',
      vars: push,
      fallback: push,
      data: { url: '/checkin', checkinId: row.id },
    });
    return 'sent';
  }

  /** Today's check-in (local day), started on first open with the friend's opening message. */
  async today(userId: string): Promise<DailyCheckin> {
    const user = await this.requireUser(userId);
    return toCheckin(await this.ensure(user, dayKey(new Date(), user.timezone)));
  }

  async reply(userId: string, text: string): Promise<CheckinReply> {
    const content = text.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_CHARS);
    if (!content) throw AppException.validation([{ field: 'text', messages: ['text should not be empty'] }]);
    const user = await this.requireUser(userId);
    const day = dayKey(new Date(), user.timezone);
    const row = await this.ensure(user, day);
    if (row.status === 'completed') throw AppException.conflict('Today’s check-in is already wrapped up');

    const messages = [...toMessages(row.messages), message('user', content)];
    const turns = messages.filter((m) => m.role === 'user').length;
    if (turns >= CHECKIN_MAX_TURNS) return this.wrapUp(user, day, row, messages);

    const facts = await this.context.day(userId, user.timezone, day);
    const reply = await this.chat.reply({
      user,
      mode: 'checkin',
      history: messages,
      profile: this.context.profileText(user),
      dayContext: this.context.dayText(facts, user.timezone),
      today: formatLongDate(new Date(), user.timezone),
      fallback: checkinFallback(chatLanguage(user.lang, messages), turns),
    });
    const updated = await this.prisma.dailyCheckin.update({
      where: { id: row.id },
      data: {
        status: 'replied',
        messages: [...messages, message('assistant', reply)] as unknown as Prisma.InputJsonValue,
      },
    });
    return { checkin: toCheckin(updated), reply, done: false };
  }

  /** "Wrap up" button: closes the check-in after at least one reply. */
  async finish(userId: string): Promise<CheckinReply> {
    const user = await this.requireUser(userId);
    const day = dayKey(new Date(), user.timezone);
    const row = await this.ensure(user, day);
    const messages = toMessages(row.messages);
    if (row.status === 'completed') {
      const last = [...messages].reverse().find((m) => m.role === 'assistant');
      return { checkin: toCheckin(row), reply: last?.content ?? '', done: true };
    }
    if (!messages.some((m) => m.role === 'user')) {
      throw AppException.badRequest('Tell me a little about your day first');
    }
    return this.wrapUp(user, day, row, messages);
  }

  /** Mood and energy per local day (the mood timeline), oldest first. */
  async mood(userId: string, days: number): Promise<MoodPoint[]> {
    const user = await this.requireUser(userId);
    const today = dayKey(new Date(), user.timezone);
    const from = addDays(today, -(days - 1));
    const rows = await this.prisma.dailyCheckin.findMany({
      where: { userId, localDate: { gte: dateOnly(from), lte: dateOnly(today) } },
      select: { localDate: true, mood: true, energy: true },
    });
    const byDay = new Map(rows.map((r) => [dayString(r.localDate), r]));
    return Array.from({ length: days }, (_, i) => {
      const date = addDays(from, i);
      const r = byDay.get(date);
      return { date, mood: r?.mood ?? null, energy: r?.energy ?? null };
    });
  }

  // ---------- internals ----------

  private async wrapUp(
    user: CompanionUser,
    day: string,
    row: DailyCheckinRow,
    messages: CompanionMessage[],
  ): Promise<CheckinReply> {
    const lang = chatLanguage(user.lang, messages);
    const [todayFacts, tomorrow] = await Promise.all([
      this.context.day(user.userId, user.timezone, day),
      this.context.day(user.userId, user.timezone, addDays(day, 1)),
    ]);
    const [closing, summary] = await Promise.all([
      this.chat.reply({
        user,
        mode: 'checkin_wrap',
        history: messages,
        profile: this.context.profileText(user),
        dayContext: this.context.dayText(todayFacts, user.timezone),
        today: formatLongDate(new Date(), user.timezone),
        fallback: checkinClosingFallback(lang),
      }),
      this.chat.summarize(user, messages),
    ]);
    const reply = `${closing}\n\n${tomorrowLine(lang, tomorrow, todayFacts.openItems)}`;
    const updated = await this.prisma.dailyCheckin.update({
      where: { id: row.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        messages: [...messages, message('assistant', reply)] as unknown as Prisma.InputJsonValue,
        ...(summary
          ? {
              mood: summary.mood,
              energy: summary.energy,
              wins: summary.wins,
              summary: summary.summary,
            }
          : {}),
      },
    });
    if (summary?.facts.length) await this.chat.rememberFacts(user.userId, summary.facts);
    this.logger.log({ userId: user.userId, mood: summary?.mood ?? null }, 'check-in wrapped up');
    return { checkin: toCheckin(updated), reply, done: true };
  }

  private async requireUser(userId: string): Promise<CompanionUser> {
    const user = await this.context.user(userId);
    if (!user) throw AppException.notFound('User');
    return user;
  }

  private async ensure(user: CompanionUser, day: string): Promise<DailyCheckinRow> {
    const existing = await this.prisma.dailyCheckin.findUnique({
      where: { userId_localDate: { userId: user.userId, localDate: dateOnly(day) } },
    });
    return existing ?? this.create(user, day);
  }

  /** New check-in row with the opening message; lighter tone when yesterday's went unanswered. */
  private async create(user: CompanionUser, day: string): Promise<DailyCheckinRow> {
    const yesterday = await this.prisma.dailyCheckin.findUnique({
      where: { userId_localDate: { userId: user.userId, localDate: dateOnly(addDays(day, -1)) } },
      select: { status: true },
    });
    const tone: CheckinTone = yesterday && ['missed', 'prompted'].includes(yesterday.status) ? 'light' : 'normal';
    const opening = message('assistant', checkinOpening(user.lang, user.name, tone));
    try {
      return await this.prisma.dailyCheckin.create({
        data: {
          userId: user.userId,
          localDate: dateOnly(day),
          tone,
          promptedAt: new Date(),
          messages: [opening] as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Two requests raced to start the same day: use the row that won.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const row = await this.prisma.dailyCheckin.findUnique({
          where: { userId_localDate: { userId: user.userId, localDate: dateOnly(day) } },
        });
        if (row) return row;
      }
      throw err;
    }
  }
}
