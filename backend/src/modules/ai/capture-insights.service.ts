import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Schema, Type } from '@google/genai';
import { z } from 'zod';
import { causeChain } from '../../common/errors/app.exception';
import type {
  CaptureInsights,
  CaptureMood,
  CapturePerson,
  CaptureSuggestion,
  CaptureSuggestionOption,
  FollowUpDraft,
} from '../../common/types/api.types';
import { renderTemplate } from '../../common/utils/template.util';
import { GeminiService, parseJsonLoose } from '../../infra/gemini/gemini.service';
import { SettingsService } from '../content/settings.service';
import { PromptsRepository } from './prompts.repository';
import type { ReportOutput } from './report.schema';

const MOODS = ['happy', 'calm', 'neutral', 'stressed', 'low'] as const;

const S = (type: Type, extra: Partial<Schema> = {}): Schema => ({ type, ...extra });

const INSIGHTS_RESPONSE_SCHEMA: Schema = S(Type.OBJECT, {
  properties: {
    people: S(Type.ARRAY, {
      items: S(Type.OBJECT, {
        properties: {
          name: S(Type.STRING),
          relation: S(Type.STRING, { nullable: true }),
          notes: S(Type.ARRAY, { items: S(Type.STRING) }),
        },
        required: ['name', 'notes'],
      }),
    }),
    userFacts: S(Type.ARRAY, { items: S(Type.STRING) }),
    mood: S(Type.STRING, { enum: [...MOODS], nullable: true }),
    energy: S(Type.INTEGER, { nullable: true }),
    unclear: S(Type.ARRAY, {
      items: S(Type.OBJECT, {
        properties: {
          index: S(Type.INTEGER),
          question: S(Type.STRING),
          options: S(Type.ARRAY, {
            items: S(Type.OBJECT, {
              properties: {
                label: S(Type.STRING),
                title: S(Type.STRING),
                remindAt: S(Type.STRING, { nullable: true }),
              },
              required: ['label', 'title'],
            }),
          }),
        },
        required: ['index', 'question', 'options'],
      }),
    }),
  },
  required: ['people', 'userFacts', 'mood', 'energy', 'unclear'],
});

const text = (max: number) => z.string().transform((s) => s.replace(/\s+/g, ' ').trim().slice(0, max));
const nullableText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((s) => {
      const t = s?.replace(/\s+/g, ' ').trim();
      return t ? t.slice(0, max) : null;
    });
const isoOrNull = z
  .string()
  .nullish()
  .transform((s) => {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  });

const insightsOutputSchema = z.object({
  people: z
    .array(z.object({ name: text(120), relation: nullableText(60), notes: z.array(text(200)).catch([]) }))
    .catch([])
    .transform((list) =>
      list
        .filter((p) => p.name)
        .slice(0, 8)
        .map((p) => ({ ...p, notes: p.notes.filter(Boolean).slice(0, 3) })),
    ),
  userFacts: z
    .array(text(200))
    .catch([])
    .transform((l) => l.filter(Boolean).slice(0, 3)),
  mood: z.enum(MOODS).nullish().catch(null),
  energy: z
    .number()
    .nullish()
    .catch(null)
    .transform((n) => (typeof n === 'number' && n >= 1 && n <= 5 ? Math.round(n) : null)),
  unclear: z
    .array(
      z.object({
        index: z.number().int(),
        question: text(160),
        options: z
          .array(z.object({ label: text(40), title: text(300), remindAt: isoOrNull }))
          .catch([])
          .transform((o) => o.filter((x) => x.label && x.title).slice(0, 3)),
      }),
    )
    .catch([]),
});

export interface InsightsInput {
  lines: string;
  reminders: ReportOutput['reminders'];
  userName: string;
  timezone: string;
  languageStyle: string;
}

/** Result for the pipeline: the stored insights plus which report reminders to hold back as suggestions. */
export interface InsightsResult {
  insights: CaptureInsights;
  /** Stored next to the insights (e.g. the follow-up email draft). */
  extra?: Record<string, unknown>;
  /** Indexes into `report.reminders` that must not be scheduled (they became suggestions). */
  heldBack: Set<number>;
}

/**
 * After a recorded conversation (user-flow §04): people, lasting facts about the user, mood, and the
 * reminders that are too unclear to set ("asks instead of guessing"). A reminder without a time always
 * becomes a suggestion. Never throws: without AI (or on failure) it returns empty insights and only the
 * time-less reminders are held back.
 */
@Injectable()
export class CaptureInsightsService {
  private readonly logger = new Logger(CaptureInsightsService.name);

  constructor(
    private readonly gemini: GeminiService,
    private readonly prompts: PromptsRepository,
    private readonly settings: SettingsService,
  ) {}

  async generate(input: InsightsInput): Promise<InsightsResult> {
    let people: CapturePerson[] = [];
    let userFacts: string[] = [];
    let mood: CaptureMood | null = null;
    let energy: number | null = null;
    const unclear = new Map<number, { question: string; options: CaptureSuggestionOption[] }>();

    if (!this.gemini.isMock) {
      try {
        const [ai, prompt] = await Promise.all([this.settings.get('ai'), this.prompts.get('capture_insights')]);
        if (prompt) {
          const reminderList = input.reminders.length
            ? input.reminders.map((r, i) => `${i}: ${r.title}, ${r.remindAt ?? 'no time said'}`).join('\n')
            : '(none)';
          const { text: raw } = await this.gemini.generateJson({
            operation: 'capture_insights',
            model: ai.model,
            systemInstruction: renderTemplate(prompt.content, {
              userName: input.userName,
              reminders: reminderList,
              timezone: input.timezone,
              languageStyle: input.languageStyle,
            }),
            contents: `<transcript>\n${input.lines}\n</transcript>`,
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseSchema: INSIGHTS_RESPONSE_SCHEMA,
          });
          const parsed = insightsOutputSchema.parse(parseJsonLoose(raw));
          people = parsed.people;
          userFacts = parsed.userFacts;
          mood = parsed.mood ?? null;
          energy = parsed.energy;
          for (const u of parsed.unclear) {
            if (u.index >= 0 && u.index < input.reminders.length && u.question) {
              unclear.set(u.index, { question: u.question, options: u.options });
            }
          }
        }
      } catch (err) {
        this.logger.warn({ causes: causeChain(err) }, 'capture insights failed; continuing without them');
      }
    }

    const askWhen = input.languageStyle === 'hinglish' ? 'Kab yaad dilaun?' : 'When should I remind you?';
    const heldBack = new Set<number>();
    const suggestions: CaptureSuggestion[] = [];
    input.reminders.forEach((r, i) => {
      const flagged = unclear.get(i);
      if (!flagged && r.remindAt) return;
      heldBack.add(i);
      suggestions.push({
        id: randomUUID(),
        title: r.title,
        body: r.body,
        remindAt: r.remindAt,
        question: flagged?.question ?? askWhen,
        options: flagged?.options ?? [],
        status: 'open',
        reminderId: null,
      });
    });

    return { insights: { people, userFacts, savedFacts: [], mood, energy, suggestions }, heldBack };
  }

  /** Drafts the recap email to the attendees (never sent here: the user sends it from their own email). */
  async followUp(input: FollowUpInput): Promise<FollowUpDraft | null> {
    const to = input.attendees.filter((a) => a.email);
    if (!to.length) return null;
    let draft = templateFollowUp(input);
    if (!this.gemini.isMock) {
      try {
        const [ai, prompt] = await Promise.all([this.settings.get('ai'), this.prompts.get('follow_up_email')]);
        if (prompt) {
          const { text: raw } = await this.gemini.generateJson({
            operation: 'follow_up_email',
            model: ai.model,
            systemInstruction: renderTemplate(prompt.content, {
              userName: input.userName,
              title: input.title,
              attendees: to.map((a) => a.name ?? a.email).join(', '),
            }),
            contents: JSON.stringify({
              summary: input.summary,
              decisions: input.decisions,
              nextSteps: input.actionItems,
            }),
            temperature: 0.4,
            maxOutputTokens: 2048,
            responseSchema: FOLLOW_UP_SCHEMA,
          });
          const parsed = followUpOutput.parse(parseJsonLoose(raw));
          if (parsed.subject && parsed.body) draft = parsed;
        }
      } catch (err) {
        this.logger.warn({ causes: causeChain(err) }, 'follow-up draft fell back to the template');
      }
    }
    return { to, subject: draft.subject, body: draft.body, status: 'draft' };
  }
}

/** Reads `meeting_reports.insights` defensively. */
export function toCaptureInsights(raw: unknown): CaptureInsights | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const strs = (v: unknown) => arr<unknown>(v).filter((s): s is string => typeof s === 'string');
  return {
    people: arr<CapturePerson>(o.people),
    userFacts: strs(o.userFacts),
    savedFacts: strs(o.savedFacts),
    mood: MOODS.includes(o.mood as CaptureMood) ? (o.mood as CaptureMood) : null,
    energy: typeof o.energy === 'number' ? o.energy : null,
    suggestions: arr<CaptureSuggestion>(o.suggestions),
  };
}

// ---------- Follow-up email draft (user-flow §06) ----------
const FOLLOW_UP_SCHEMA: Schema = S(Type.OBJECT, {
  properties: { subject: S(Type.STRING), body: S(Type.STRING) },
  required: ['subject', 'body'],
});
const followUpOutput = z.object({ subject: text(200), body: z.string().transform((b) => b.trim().slice(0, 4000)) });

export interface FollowUpInput {
  userName: string;
  title: string;
  attendees: { name: string | null; email: string }[];
  summary: string;
  decisions: string[];
  actionItems: { title: string; assigneeName: string | null; dueAt: string | null }[];
}

/** Plain draft used when the AI is off or fails: summary, decisions and next steps. */
export function templateFollowUp(input: FollowUpInput): { subject: string; body: string } {
  const first = input.userName.split(/\s+/)[0] || input.userName;
  const lines = [
    'Hi all,',
    '',
    `Thanks for the time today. Here is a quick recap of "${input.title}".`,
    '',
    input.summary.trim(),
  ];
  if (input.decisions.length) lines.push('', 'Decisions:', ...input.decisions.map((d) => `- ${d}`));
  if (input.actionItems.length) {
    lines.push(
      '',
      'Next steps:',
      ...input.actionItems.map(
        (a) =>
          `- ${a.title}${a.assigneeName ? ` (${a.assigneeName})` : ''}${a.dueAt ? `, by ${a.dueAt.slice(0, 10)}` : ''}`,
      ),
    );
  }
  lines.push('', 'Best,', first);
  return { subject: `Follow-up: ${input.title}`.slice(0, 200), body: lines.join('\n') };
}

/** Reads `insights.followUp` defensively. */
export function toFollowUp(raw: unknown): FollowUpDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = (raw as Record<string, unknown>).followUp;
  if (!f || typeof f !== 'object') return null;
  const o = f as Record<string, unknown>;
  const to = Array.isArray(o.to)
    ? o.to
        .filter(
          (r): r is Record<string, unknown> =>
            !!r && typeof r === 'object' && typeof (r as { email?: unknown }).email === 'string',
        )
        .map((r) => ({ name: typeof r.name === 'string' ? r.name : null, email: r.email as string }))
    : [];
  if (!to.length || typeof o.subject !== 'string' || typeof o.body !== 'string') return null;
  const status = o.status === 'sent' || o.status === 'skipped' ? o.status : 'draft';
  return { to, subject: o.subject, body: o.body, status };
}
