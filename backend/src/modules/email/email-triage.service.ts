import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Schema, Type } from '@google/genai';
import { z } from 'zod';
import { causeChain } from '../../common/errors/app.exception';
import type { EmailCategory, EmailDetected } from '../../common/types/api.types';
import { renderTemplate } from '../../common/utils/template.util';
import { formatDateTime } from '../../common/utils/time.util';
import { GeminiBlockedError, GeminiService, parseJsonLoose } from '../../infra/gemini/gemini.service';
import { PromptsRepository } from '../ai/prompts.repository';
import { SettingsService } from '../content/settings.service';
import { utcOffset } from '../talk/slots.util';
import type { RawEmail } from './email-providers';
import { heuristicTriage } from './email.util';

export interface TriageInput {
  userName: string;
  userEmail: string;
  profile: string;
  timezone: string;
  vip: string[];
  muted: string[];
}

export interface Triage {
  category: Exclude<EmailCategory, 'sensitive'>;
  summary: string | null;
  why: string | null;
  detected: EmailDetected[];
}

const CATEGORIES = ['urgent', 'needs_reply', 'fyi', 'promotion', 'phishing'] as const;
const KINDS = ['deadline', 'bill', 'booking', 'travel'] as const;
const BATCH = 10;

const S = (type: Type, extra: Partial<Schema> = {}): Schema => ({ type, ...extra });
const SCHEMA: Schema = S(Type.OBJECT, {
  properties: {
    items: S(Type.ARRAY, {
      items: S(Type.OBJECT, {
        properties: {
          index: S(Type.INTEGER),
          category: S(Type.STRING, { enum: [...CATEGORIES] }),
          summary: S(Type.STRING),
          why: S(Type.STRING, { nullable: true }),
          detected: S(Type.ARRAY, {
            items: S(Type.OBJECT, {
              properties: {
                kind: S(Type.STRING, { enum: [...KINDS] }),
                title: S(Type.STRING),
                dueAt: S(Type.STRING, { nullable: true }),
              },
              required: ['kind', 'title', 'dueAt'],
            }),
          }),
        },
        required: ['index', 'category', 'summary', 'why', 'detected'],
      }),
    }),
  },
  required: ['items'],
});

const out = z.object({
  items: z
    .array(
      z.object({
        index: z.number().int(),
        category: z.enum(CATEGORIES).catch('fyi'),
        summary: z
          .string()
          .catch('')
          .transform((s) => s.replace(/\s+/g, ' ').trim().slice(0, 200)),
        why: z
          .string()
          .nullish()
          .catch(null)
          .transform((s) => (s?.trim() ? s.trim().slice(0, 140) : null)),
        detected: z
          .array(
            z.object({
              kind: z.enum(KINDS).catch('deadline'),
              title: z.string().catch(''),
              dueAt: z.string().nullish().catch(null),
            }),
          )
          .catch([]),
      }),
    )
    .catch([]),
});

function validDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Reads new emails so the friend alerts only on what truly matters (user-flow §07): urgent, needs a
 * reply, FYI, promotion or phishing, a one-line summary, why it matters, and the deadlines, bills,
 * bookings and travel it mentions. Email text is sent to the model only, never stored.
 */
@Injectable()
export class EmailTriageService {
  private readonly logger = new Logger(EmailTriageService.name);

  constructor(
    private readonly gemini: GeminiService,
    private readonly prompts: PromptsRepository,
    private readonly settings: SettingsService,
  ) {}

  async triage(user: TriageInput, emails: RawEmail[]): Promise<Triage[]> {
    const results: Triage[] = [];
    for (let i = 0; i < emails.length; i += BATCH) {
      results.push(...(await this.batch(user, emails.slice(i, i + BATCH))));
    }
    return results;
  }

  private fallback(e: RawEmail): Triage {
    const h = heuristicTriage(e);
    return { category: h.category === 'sensitive' ? 'fyi' : h.category, summary: h.summary, why: h.why, detected: [] };
  }

  private async batch(user: TriageInput, emails: RawEmail[]): Promise<Triage[]> {
    if (this.gemini.isMock) return emails.map((e) => this.fallback(e));
    try {
      const [ai, prompt, branding] = await Promise.all([
        this.settings.get('ai'),
        this.prompts.get('email_triage'),
        this.settings.get('branding'),
      ]);
      if (!prompt) return emails.map((e) => this.fallback(e));
      const now = new Date();
      const system = renderTemplate(prompt.content, {
        appName: branding.appName,
        userName: user.userName,
        userEmail: user.userEmail,
        profile: user.profile,
        now: formatDateTime(now, user.timezone),
        timezone: `${user.timezone}, ${utcOffset(now, user.timezone)}`,
        vips: user.vip.length ? user.vip.slice(0, 30).join(', ') : 'none',
        muted: user.muted.length ? user.muted.slice(0, 30).join(', ') : 'none',
      });
      const text = emails
        .map(
          (e, i) =>
            `#${i}\nFrom: ${e.fromName ?? ''} <${e.fromEmail ?? 'unknown'}>\nReceived: ${formatDateTime(e.receivedAt, user.timezone)}\n` +
            `Subject: ${e.subject ?? '(none)'}\n---\n${e.text.slice(0, 1500)}`,
        )
        .join('\n\n=====\n\n');
      const { text: raw } = await this.gemini.generateJson({
        operation: 'email_triage',
        model: ai.model,
        systemInstruction: system,
        contents: [{ role: 'user', parts: [{ text }] }],
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseSchema: SCHEMA,
      });
      const parsed = out.parse(parseJsonLoose(raw));
      return emails.map((e, i) => {
        const item = parsed.items.find((x) => x.index === i);
        if (!item) return this.fallback(e);
        return {
          category: item.category,
          summary: item.summary || e.subject?.slice(0, 140) || null,
          why: item.why,
          detected:
            item.category === 'phishing' || item.category === 'promotion'
              ? []
              : item.detected
                  .filter((d) => d.title.trim())
                  .slice(0, 3)
                  .map((d) => ({
                    id: randomUUID(),
                    kind: d.kind,
                    title: d.title.trim().slice(0, 200),
                    dueAt: validDate(d.dueAt),
                    status: 'open' as const,
                    reminderId: null,
                  })),
        };
      });
    } catch (err) {
      if (!(err instanceof GeminiBlockedError)) {
        this.logger.warn({ causes: causeChain(err) }, 'email triage fell back to rules');
      }
      return emails.map((e) => this.fallback(e));
    }
  }
}
