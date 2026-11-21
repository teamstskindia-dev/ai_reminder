import { Injectable, Logger } from '@nestjs/common';
import { Schema, Type } from '@google/genai';
import { z } from 'zod';
import { causeChain } from '../../common/errors/app.exception';
import type { MoodInsights, MoodPoint } from '../../common/types/api.types';
import { renderTemplate } from '../../common/utils/template.util';
import { safeTimeZone } from '../../common/utils/time.util';
import { GeminiService, parseJsonLoose } from '../../infra/gemini/gemini.service';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PromptsRepository } from '../ai/prompts.repository';
import { SettingsService } from '../content/settings.service';
import type { CompanionUser } from './companion-context.service';
import { moodStats } from './mood-insights.util';
import { addDays, dateOnly, dayKey, dayString } from './rhythm.util';

const S = (type: Type, extra: Partial<Schema> = {}): Schema => ({ type, ...extra });

const INSIGHTS_SCHEMA: Schema = S(Type.OBJECT, {
  properties: {
    lifts: S(Type.ARRAY, { items: S(Type.STRING) }),
    drains: S(Type.ARRAY, { items: S(Type.STRING) }),
    note: S(Type.STRING, { nullable: true }),
  },
  required: ['lifts', 'drains'],
});

const phrases = z
  .array(z.string())
  .catch([])
  .transform((v) =>
    v
      .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 3),
  );

const insightsSchema = z.object({
  lifts: phrases,
  drains: phrases,
  note: z
    .string()
    .nullish()
    .transform((v) => v?.replace(/\s+/g, ' ').trim().slice(0, 200) || null),
});

interface StoredInsights {
  lifts: string[];
  drains: string[];
  note: string | null;
  updatedAt: string;
}

/** Re-ask the AI about lifts and drains at most this often. */
const REFRESH_DAYS = 6;
/** Check-ins with a summary needed (in the last 21 days) before patterns are worth guessing. */
const MIN_CHECKINS = 3;

function stored(value: unknown): StoredInsights | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Partial<StoredInsights>;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  return {
    lifts: list(v.lifts),
    drains: list(v.drains),
    note: typeof v.note === 'string' ? v.note : null,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : new Date(0).toISOString(),
  };
}

/**
 * Mood and energy insights on the You screen (user-flow §10): weekly patterns computed from check-ins, plus
 * what lifts and what drains the user, refreshed by night learning about once a week.
 */
@Injectable()
export class MoodInsightsService {
  private readonly logger = new Logger(MoodInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly prompts: PromptsRepository,
    private readonly settings: SettingsService,
  ) {}

  async get(userId: string): Promise<MoodInsights> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, profile: { select: { moodInsights: true } } },
    });
    const today = dayKey(new Date(), safeTimeZone(user?.timezone ?? 'UTC'));
    const points = await this.points(userId, today, 56);
    const stats = moodStats(points);
    const ai = stored(user?.profile?.moodInsights);
    return {
      days: points.slice(-28),
      ...stats,
      lifts: ai?.lifts ?? [],
      drains: ai?.drains ?? [],
      note: ai?.note ?? null,
      updatedAt: ai?.updatedAt ?? null,
    };
  }

  /** Night learning: refreshes lifts and drains when they are a week old and there is enough to go on. */
  async refreshIfStale(user: CompanionUser, today: string): Promise<boolean> {
    if (this.gemini.isMock || user.settings.learningPaused) return false;
    const current = stored(user.profile?.moodInsights);
    if (current && Date.now() - new Date(current.updatedAt).getTime() < REFRESH_DAYS * 86_400_000) return false;
    const rows = await this.prisma.dailyCheckin.findMany({
      where: { userId: user.userId, localDate: { gte: dateOnly(addDays(today, -21)) }, summary: { not: null } },
      orderBy: { localDate: 'asc' },
      select: { localDate: true, mood: true, energy: true, summary: true, wins: true },
    });
    if (rows.length < MIN_CHECKINS) return false;
    try {
      const [ai, prompt, branding] = await Promise.all([
        this.settings.get('ai'),
        this.prompts.get('mood_insights'),
        this.settings.get('branding'),
      ]);
      if (!prompt) return false;
      const checkins = rows
        .map((r) => {
          const wins = Array.isArray(r.wins) ? r.wins.filter((w): w is string => typeof w === 'string') : [];
          return `${dayString(r.localDate)} · mood ${r.mood ?? '?'} · energy ${r.energy ?? '?'} · ${r.summary}${
            wins.length ? ` · wins: ${wins.join('; ')}` : ''
          }`;
        })
        .join('\n');
      const { text } = await this.gemini.generateJson({
        operation: 'mood_insights',
        model: ai.model,
        systemInstruction: renderTemplate(prompt.content, {
          appName: branding.appName,
          userName: user.name ?? 'the user',
          checkins,
        }),
        contents: 'Return the JSON now.',
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseSchema: INSIGHTS_SCHEMA,
      });
      const parsed = insightsSchema.parse(parseJsonLoose(text));
      const value: StoredInsights = { ...parsed, updatedAt: new Date().toISOString() };
      await this.prisma.userProfile.update({
        where: { userId: user.userId },
        data: { moodInsights: value as unknown as Prisma.InputJsonValue },
      });
      return true;
    } catch (err) {
      this.logger.warn({ userId: user.userId, causes: causeChain(err) }, 'mood insights failed');
      return false;
    }
  }

  private async points(userId: string, today: string, days: number): Promise<MoodPoint[]> {
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
}
