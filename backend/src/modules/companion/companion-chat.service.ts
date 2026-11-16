import { Injectable, Logger } from '@nestjs/common';
import { Schema, Type } from '@google/genai';
import { z } from 'zod';
import { causeChain } from '../../common/errors/app.exception';
import type { CompanionMessage } from '../../common/types/api.types';
import { renderTemplate } from '../../common/utils/template.util';
import { GeminiBlockedError, GeminiService, parseJsonLoose } from '../../infra/gemini/gemini.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PromptsRepository } from '../ai/prompts.repository';
import { SettingsService } from '../content/settings.service';
import { cleanReply } from '../onboarding/onboarding.service';
import type { CompanionUser } from './companion-context.service';
import { stageTone } from './companion.copy';

export type ChatMode = 'checkin' | 'checkin_wrap' | 'nudge';

const MODE_INSTRUCTION: Record<ChatMode, (nudge: string) => string> = {
  checkin: () => 'This is the evening check-in: you asked how their day went. Help them reflect on the day.',
  checkin_wrap: () =>
    'The evening check-in is ending. Write a warm closing of at most two short sentences: reflect their day in a few words and celebrate one win if there was one. Do not ask a question and do not mention tomorrow (the plan is added separately).',
  nudge: (nudge) =>
    `Earlier today you reached out first with: "${nudge}". They replied. Continue naturally as a caring friend.`,
};

const S = (type: Type, extra: Partial<Schema> = {}): Schema => ({ type, ...extra });

const SUMMARY_SCHEMA: Schema = S(Type.OBJECT, {
  properties: {
    mood: S(Type.INTEGER, { nullable: true }),
    energy: S(Type.INTEGER, { nullable: true }),
    wins: S(Type.ARRAY, { items: S(Type.STRING) }),
    summary: S(Type.STRING, { nullable: true }),
    facts: S(Type.ARRAY, { items: S(Type.STRING) }),
  },
  required: ['wins', 'facts'],
});

const score = z
  .number()
  .int()
  .min(1)
  .max(5)
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);
const shortList = (max: number, n: number) =>
  z
    .array(z.string())
    .catch([])
    .transform((l) =>
      l
        .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, max))
        .filter(Boolean)
        .slice(0, n),
    );

const summarySchema = z.object({
  mood: score,
  energy: score,
  wins: shortList(160, 3),
  summary: z
    .string()
    .nullish()
    .transform((v) => v?.replace(/\s+/g, ' ').trim().slice(0, 400) || null),
  facts: shortList(200, 3),
});
export type CheckinSummary = z.infer<typeof summarySchema>;

const MAX_FACTS = 30;

/** The friend's voice in the evening check-in and nudge chats, plus what it learns from them. */
@Injectable()
export class CompanionChatService {
  private readonly logger = new Logger(CompanionChatService.name);

  constructor(
    private readonly gemini: GeminiService,
    private readonly prompts: PromptsRepository,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  get aiEnabled(): boolean {
    return !this.gemini.isMock;
  }

  /** One reply from the friend; `fallback` is used when the AI is off or fails (never blocks the chat). */
  async reply(opts: {
    user: CompanionUser;
    mode: ChatMode;
    history: CompanionMessage[];
    profile: string;
    dayContext: string;
    today: string;
    nudgeText?: string;
    fallback: string;
  }): Promise<string> {
    if (this.gemini.isMock) return opts.fallback;
    try {
      const [ai, prompt, branding] = await Promise.all([
        this.settings.get('ai'),
        this.prompts.get('companion_chat'),
        this.settings.get('branding'),
      ]);
      if (!prompt) return opts.fallback;
      const stage = opts.user.profile?.relationshipStage ?? 1;
      const systemInstruction = renderTemplate(prompt.content, {
        appName: branding.appName,
        userName: opts.user.name ?? 'your friend',
        modeInstruction: MODE_INSTRUCTION[opts.mode](opts.nudgeText ?? ''),
        profile: opts.profile,
        today: opts.today,
        dayContext: opts.dayContext,
        stage,
        stageTone: stageTone(stage),
      });
      const contents = opts.history.slice(-12).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content.slice(0, 1000) }],
      }));
      // The model must answer a user turn; "Wrap up" can come right after the friend spoke.
      if (contents[contents.length - 1]?.role !== 'user') {
        contents.push({ role: 'user', parts: [{ text: '(The user tapped "Wrap up".)' }] });
      }
      const text = await this.gemini.generateText({
        operation: `companion_${opts.mode}`,
        model: ai.model,
        systemInstruction,
        contents,
        temperature: 0.8,
        // Thinking models spend part of this budget before answering; a small cap truncates the reply.
        maxOutputTokens: 4096,
      });
      return cleanReply(text) || opts.fallback;
    } catch (err) {
      if (!(err instanceof GeminiBlockedError)) {
        this.logger.warn({ mode: opts.mode, causes: causeChain(err) }, 'companion reply fell back to the script');
      }
      return opts.fallback;
    }
  }

  /** Mood, energy, wins, a one-line summary and lasting facts from a finished check-in. */
  async summarize(user: CompanionUser, messages: CompanionMessage[]): Promise<CheckinSummary | null> {
    if (this.gemini.isMock || !messages.some((m) => m.role === 'user')) return null;
    try {
      const [ai, prompt] = await Promise.all([this.settings.get('ai'), this.prompts.get('checkin_summary')]);
      if (!prompt) return null;
      const transcript = messages.map((m) => `${m.role === 'user' ? 'User' : 'Friend'}: ${m.content}`).join('\n');
      const { text } = await this.gemini.generateJson({
        operation: 'checkin_summary',
        model: ai.model,
        systemInstruction: renderTemplate(prompt.content, { userName: user.name ?? 'the user' }),
        contents: `<conversation>\n${transcript}\n</conversation>`,
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseSchema: SUMMARY_SCHEMA,
      });
      return summarySchema.parse(parseJsonLoose(text));
    } catch (err) {
      this.logger.warn({ causes: causeChain(err) }, 'check-in summary failed');
      return null;
    }
  }

  /** Adds new facts to the profile (de-duplicated, newest kept, capped). */
  async rememberFacts(userId: string, facts: string[]): Promise<void> {
    if (!facts.length) return;
    const profile = await this.prisma.userProfile.findUnique({ where: { userId }, select: { facts: true } });
    const current = Array.isArray(profile?.facts)
      ? profile.facts.filter((f): f is string => typeof f === 'string')
      : [];
    const seen = new Set(current.map((f) => f.toLowerCase()));
    const merged = [...current, ...facts.filter((f) => !seen.has(f.toLowerCase()))].slice(-MAX_FACTS);
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, status: 'skipped', facts: merged },
      update: { facts: merged },
    });
  }
}
