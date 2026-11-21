import { Injectable, Logger } from '@nestjs/common';
import { Schema, Type } from '@google/genai';
import { z } from 'zod';
import { causeChain } from '../../common/errors/app.exception';
import { renderTemplate } from '../../common/utils/template.util';
import { formatTime } from '../../common/utils/time.util';
import { GeminiService, parseJsonLoose } from '../../infra/gemini/gemini.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PromptsRepository } from '../ai/prompts.repository';
import { SettingsService } from '../content/settings.service';
import { CompanionContextService, type CompanionUser, type DayFacts } from './companion-context.service';
import { MoodInsightsService } from './mood-insights.service';
import { NudgeService } from './nudge.service';
import { addDays, atLocalTime, dateOnly, nextWarmth, stageFor, type CheckinOutcome } from './rhythm.util';

const S = (type: Type, extra: Partial<Schema> = {}): Schema => ({ type, ...extra });

const LEARNING_SCHEMA: Schema = S(Type.OBJECT, {
  properties: {
    summary: S(Type.STRING, { nullable: true }),
    nudge: S(Type.OBJECT, {
      nullable: true,
      properties: { text: S(Type.STRING), time: S(Type.STRING), reason: S(Type.STRING) },
      required: ['text'],
    }),
  },
});

const learningSchema = z.object({
  summary: z
    .string()
    .nullish()
    .transform((v) => v?.replace(/\s+/g, ' ').trim().slice(0, 600) || null),
  nudge: z
    .object({
      text: z.string().transform((v) => v.replace(/\s+/g, ' ').trim().slice(0, 300)),
      time: z.string().nullish(),
      reason: z.string().nullish(),
    })
    .nullish()
    .catch(null),
});

/**
 * Night learning (user-flow §03), around 03:00 local: closes yesterday's unanswered check-in as missed,
 * grows (or gently lowers) relationship warmth, refreshes the profile summary and decides whether a
 * proactive nudge is worth sending today, and about once a week what lifts and drains the user. The AI part
 * is optional; warmth always updates unless the user paused learning.
 */
@Injectable()
export class NightlyService {
  private readonly logger = new Logger(NightlyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: CompanionContextService,
    private readonly nudges: NudgeService,
    private readonly gemini: GeminiService,
    private readonly prompts: PromptsRepository,
    private readonly settings: SettingsService,
    private readonly moodInsights: MoodInsightsService,
  ) {}

  /** `day` is the user's local "today" (the night that just passed belongs to yesterday). */
  async run(userId: string, day: string): Promise<{ outcome: CheckinOutcome; warmth: number; nudge: boolean }> {
    const user = await this.context.user(userId);
    if (!user) return { outcome: 'none', warmth: 0, nudge: false };
    const yesterday = addDays(day, -1);

    const checkin = await this.prisma.dailyCheckin.findUnique({
      where: { userId_localDate: { userId, localDate: dateOnly(yesterday) } },
    });
    let outcome: CheckinOutcome = 'none';
    if (checkin) {
      if (checkin.status === 'prompted') {
        await this.prisma.dailyCheckin.update({ where: { id: checkin.id }, data: { status: 'missed' } });
        outcome = 'missed';
      } else {
        outcome = checkin.status as CheckinOutcome;
      }
    }

    const [yFacts, tFacts, active] = await Promise.all([
      this.context.day(userId, user.timezone, yesterday),
      this.context.day(userId, user.timezone, day),
      this.wasActive(userId, user.timezone, yesterday),
    ]);
    // Learning paused (§10): warmth, the profile summary and mood insights stay as they are.
    const paused = user.settings.learningPaused;
    const warmth = paused ? (user.profile?.warmth ?? 0) : nextWarmth(user.profile?.warmth ?? 0, outcome, active);
    if (!paused) {
      await this.prisma.userProfile.upsert({
        where: { userId },
        create: { userId, status: 'skipped', warmth, relationshipStage: stageFor(warmth), learnedAt: new Date() },
        update: { warmth, relationshipStage: stageFor(warmth), learnedAt: new Date() },
      });
      await this.moodInsights.refreshIfStale(user, day);
    }

    let nudge = false;
    const worthThinking = !!checkin?.summary || yFacts.meetings > 0 || tFacts.meetings > 0;
    if (!this.gemini.isMock && worthThinking) {
      const learned = await this.learn(user, checkin?.summary ?? null, checkin?.mood ?? null, yFacts, tFacts);
      if (learned?.summary && !paused) {
        await this.prisma.userProfile.update({ where: { userId }, data: { summary: learned.summary } });
      }
      if (learned?.nudge?.text && user.settings.pushNotifications) {
        nudge = !!(await this.nudges.schedule(user, day, {
          text: learned.nudge.text,
          time: learned.nudge.time ?? null,
          reason: learned.nudge.reason ?? null,
        }));
      }
    }
    this.logger.log({ userId, outcome, warmth, nudge }, 'night learning finished');
    return { outcome, warmth, nudge };
  }

  private async wasActive(userId: string, timezone: string, day: string): Promise<boolean> {
    const start = atLocalTime(day, timezone, '00:00');
    const range = { gte: start, lt: new Date(start.getTime() + 24 * 3600_000) };
    const [done, items, meetings] = await Promise.all([
      this.prisma.reminder.count({ where: { userId, doneAt: range } }),
      this.prisma.actionItem.count({ where: { userId, completedAt: range } }),
      this.prisma.meeting.count({ where: { userId, status: 'completed', startAt: range } }),
    ]);
    return done + items + meetings > 0;
  }

  private async learn(
    user: CompanionUser,
    checkinSummary: string | null,
    mood: number | null,
    yesterday: DayFacts,
    today: DayFacts,
  ): Promise<z.infer<typeof learningSchema> | null> {
    try {
      const [ai, prompt, branding] = await Promise.all([
        this.settings.get('ai'),
        this.prompts.get('nightly_learning'),
        this.settings.get('branding'),
      ]);
      if (!prompt) return null;
      const meetings = (f: DayFacts) =>
        f.meetingList.length
          ? f.meetingList
              .map(
                (m) =>
                  `${m.title} (${formatTime(m.startAt, user.timezone)}${m.endAt ? `–${formatTime(m.endAt, user.timezone)}` : ''})`,
              )
              .join('; ')
          : 'none';
      const facts = Array.isArray(user.profile?.facts)
        ? (user.profile.facts as unknown[]).filter((f) => typeof f === 'string')
        : [];
      const { text } = await this.gemini.generateJson({
        operation: 'nightly_learning',
        model: ai.model,
        systemInstruction: renderTemplate(prompt.content, {
          userName: user.name ?? 'the user',
          appName: branding.appName,
          profileSummary: user.profile?.summary ?? '(none)',
          facts: facts.length ? facts.slice(0, 12).join('; ') : '(none)',
          checkin: checkinSummary ? `${checkinSummary}${mood ? ` (mood ${mood}/5)` : ''}` : '(no check-in)',
          yesterdayMeetings: meetings(yesterday),
          todayMeetings: meetings(today),
          openCount: today.openItems,
          languageStyle: user.lang,
        }),
        contents: 'Return the JSON now.',
        temperature: 0.4,
        maxOutputTokens: 2048,
        responseSchema: LEARNING_SCHEMA,
      });
      return learningSchema.parse(parseJsonLoose(text));
    } catch (err) {
      this.logger.warn({ userId: user.userId, causes: causeChain(err) }, 'night learning AI step failed');
      return null;
    }
  }
}
