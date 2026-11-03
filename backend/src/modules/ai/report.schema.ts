import { Schema, Type } from '@google/genai';
import { z } from 'zod';

const str = (max: number) => z.string().transform((s) => s.trim().slice(0, max));
const nullableStr = (max: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((s) => (s && s.trim() ? s.trim().slice(0, max) : null));
const score = z
  .number()
  .nullable()
  .optional()
  .transform((n) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n)) * 100) / 100 : null,
  );
const capped = <T extends z.ZodType>(item: T, max: number) =>
  z
    .array(item)
    .optional()
    .transform((a) => (a ?? []).slice(0, max) as z.output<T>[]);
const isoDate = z
  .string()
  .nullable()
  .optional()
  .transform((s) => {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  });

/**
 * Validation of the Gemini `meeting_report` output. Lenient on length (truncates) but strict on
 * structure/types; anything structurally wrong triggers the single repair attempt.
 */
export const reportOutputSchema = z.object({
  summary: str(8000).pipe(z.string().min(1, 'summary must not be empty')),
  keyPoints: capped(str(500), 15),
  chapters: capped(
    z.object({
      title: str(200),
      summary: str(1000),
      startMs: z.number().transform((n) => Math.max(0, Math.round(n))),
    }),
    40,
  ),
  keyQuestions: capped(z.object({ question: str(500), answer: nullableStr(2000), askedBy: nullableStr(200) }), 25),
  decisions: capped(str(500), 25),
  topics: capped(
    str(60).transform((t) => t.toLowerCase()),
    8,
  ),
  actionItems: capped(
    z.object({
      title: str(300).pipe(z.string().min(1)),
      description: nullableStr(2000),
      assigneeName: nullableStr(200),
      isMine: z
        .boolean()
        .optional()
        .transform((b) => b ?? false),
      dueAt: isoDate,
      priority: z
        .enum(['low', 'medium', 'high'])
        .optional()
        .transform((p) => p ?? 'medium'),
    }),
    40,
  ),
  reminders: capped(
    z.object({ title: str(300).pipe(z.string().min(1)), body: nullableStr(2000), remindAt: isoDate }),
    20,
  ),
  sentimentScore: score,
  sentimentLabel: z
    .enum(['positive', 'neutral', 'negative'])
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  engagementScore: score,
  meetingScore: score,
});

export type ReportOutput = z.output<typeof reportOutputSchema>;

const S = (type: Type, extra: Partial<Schema> = {}): Schema => ({ type, ...extra });

/** Gemini `responseSchema` matching reportOutputSchema. */
export const REPORT_RESPONSE_SCHEMA: Schema = S(Type.OBJECT, {
  properties: {
    summary: S(Type.STRING),
    keyPoints: S(Type.ARRAY, { items: S(Type.STRING) }),
    chapters: S(Type.ARRAY, {
      items: S(Type.OBJECT, {
        properties: { title: S(Type.STRING), summary: S(Type.STRING), startMs: S(Type.INTEGER) },
        required: ['title', 'summary', 'startMs'],
      }),
    }),
    keyQuestions: S(Type.ARRAY, {
      items: S(Type.OBJECT, {
        properties: {
          question: S(Type.STRING),
          answer: S(Type.STRING, { nullable: true }),
          askedBy: S(Type.STRING, { nullable: true }),
        },
        required: ['question'],
      }),
    }),
    decisions: S(Type.ARRAY, { items: S(Type.STRING) }),
    topics: S(Type.ARRAY, { items: S(Type.STRING) }),
    actionItems: S(Type.ARRAY, {
      items: S(Type.OBJECT, {
        properties: {
          title: S(Type.STRING),
          description: S(Type.STRING, { nullable: true }),
          assigneeName: S(Type.STRING, { nullable: true }),
          isMine: S(Type.BOOLEAN),
          dueAt: S(Type.STRING, { nullable: true, description: 'ISO-8601 with timezone offset, or null' }),
          priority: S(Type.STRING, { enum: ['low', 'medium', 'high'] }),
        },
        required: ['title', 'isMine', 'priority'],
      }),
    }),
    reminders: S(Type.ARRAY, {
      items: S(Type.OBJECT, {
        properties: {
          title: S(Type.STRING),
          body: S(Type.STRING, { nullable: true }),
          remindAt: S(Type.STRING, { description: 'ISO-8601 with timezone offset' }),
        },
        required: ['title', 'remindAt'],
      }),
    }),
    sentimentScore: S(Type.NUMBER, { nullable: true }),
    sentimentLabel: S(Type.STRING, { enum: ['positive', 'neutral', 'negative'], nullable: true }),
    engagementScore: S(Type.NUMBER, { nullable: true }),
    meetingScore: S(Type.NUMBER, { nullable: true }),
  },
  required: [
    'summary',
    'keyPoints',
    'chapters',
    'keyQuestions',
    'decisions',
    'topics',
    'actionItems',
    'reminders',
    'sentimentScore',
    'sentimentLabel',
    'engagementScore',
    'meetingScore',
  ],
  propertyOrdering: [
    'summary',
    'keyPoints',
    'chapters',
    'keyQuestions',
    'decisions',
    'topics',
    'actionItems',
    'reminders',
    'sentimentScore',
    'sentimentLabel',
    'engagementScore',
    'meetingScore',
  ],
});

/** Audio transcription output. */
export const transcriptionOutputSchema = z.object({
  segments: z
    .array(
      z.object({
        speaker: str(120).transform((s) => s || 'Unknown'),
        text: str(5000),
        startMs: z.number().transform((n) => Math.max(0, Math.round(n))),
        endMs: z
          .number()
          .nullable()
          .optional()
          .transform((n) => (typeof n === 'number' ? Math.max(0, Math.round(n)) : null)),
      }),
    )
    .max(20_000),
});

export const TRANSCRIPTION_RESPONSE_SCHEMA: Schema = S(Type.OBJECT, {
  properties: {
    segments: S(Type.ARRAY, {
      items: S(Type.OBJECT, {
        properties: {
          speaker: S(Type.STRING),
          text: S(Type.STRING),
          startMs: S(Type.INTEGER),
          endMs: S(Type.INTEGER, { nullable: true }),
        },
        required: ['speaker', 'text', 'startMs'],
      }),
    }),
  },
  required: ['segments'],
});
