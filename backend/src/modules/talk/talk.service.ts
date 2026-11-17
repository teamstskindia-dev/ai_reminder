import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Schema, Type } from '@google/genai';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { AppException, causeChain } from '../../common/errors/app.exception';
import { Paginated } from '../../common/pagination/pagination';
import type {
  AssistantSource,
  LanguageStyle,
  TalkAction,
  TalkIntent,
  TalkMessage,
  TalkReply,
} from '../../common/types/api.types';
import { renderTemplate, truncate } from '../../common/utils/template.util';
import { formatDateTime, safeTimeZone } from '../../common/utils/time.util';
import { GeminiBlockedError, GeminiService, parseJsonLoose } from '../../infra/gemini/gemini.service';
import type { AssistantMessageRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';
import { EmbeddingService } from '../ai/embedding.service';
import { PromptsRepository } from '../ai/prompts.repository';
import { CalendarWriteService } from '../calendar/calendar-write.service';
import { CompanionChatService } from '../companion/companion-chat.service';
import { CompanionContextService, type CompanionUser } from '../companion/companion-context.service';
import { stageTone } from '../companion/companion.copy';
import { dayKey } from '../companion/rhythm.util';
import { SettingsService } from '../content/settings.service';
import { cleanReply } from '../onboarding/onboarding.service';
import { DEFAULT_REMINDER_CHANNELS, RemindersService } from '../reminders/reminders.service';
import { UsersRepository } from '../users/users.repository';
import { findFreeSlot, utcOffset } from './slots.util';
import { consistentReply, pick } from './talk-reply';
import { TalkScheduleDto, TalkSendDto } from './talk.dto';

const INTENTS = ['vent', 'advice', 'recall', 'task', 'chat'] as const;
const ACTIONS = ['none', 'set_reminder', 'schedule_meeting', 'draft_email', 'create_task', 'read_email'] as const;
const TOOLS: Record<string, string> = {
  jira: 'Jira',
  notion: 'Notion',
  linear: 'Linear',
  todoist: 'Todoist',
  asana: 'Asana',
};
const HISTORY = 12;

const S = (type: Type, extra: Partial<Schema> = {}): Schema => ({ type, ...extra });
const nstr = () => S(Type.STRING, { nullable: true });

const TALK_SCHEMA: Schema = S(Type.OBJECT, {
  properties: {
    intent: S(Type.STRING, { enum: [...INTENTS] }),
    reply: S(Type.STRING),
    sourcesUsed: S(Type.ARRAY, { items: S(Type.INTEGER) }),
    crisis: S(Type.BOOLEAN),
    facts: S(Type.ARRAY, { items: S(Type.STRING) }),
    mood: S(Type.INTEGER, { nullable: true }),
    action: S(Type.OBJECT, {
      nullable: true,
      properties: {
        type: S(Type.STRING, { enum: [...ACTIONS] }),
        title: nstr(),
        remindAt: nstr(),
        withName: nstr(),
        email: nstr(),
        windowStart: nstr(),
        windowEnd: nstr(),
        durationMinutes: S(Type.INTEGER, { nullable: true }),
        to: nstr(),
        subject: nstr(),
        body: nstr(),
        details: nstr(),
        tool: nstr(),
        request: nstr(),
      },
      // All required (each nullable): smaller models otherwise leave out the time or the window.
      required: [
        'type',
        'title',
        'remindAt',
        'withName',
        'email',
        'windowStart',
        'windowEnd',
        'durationMinutes',
        'to',
        'subject',
        'body',
        'details',
        'tool',
        'request',
      ],
    }),
  },
  required: ['intent', 'reply', 'crisis', 'facts'],
});

const optStr = (max: number) =>
  z
    .string()
    .nullish()
    .transform((s) => (s?.trim() ? s.trim().slice(0, max) : null));
const isoDate = z
  .string()
  .nullish()
  .transform((s) => {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  });

const talkOutput = z.object({
  intent: z.enum(INTENTS).catch('chat'),
  reply: z.string().transform((s) => s.trim()),
  sourcesUsed: z.array(z.number().int()).catch([]),
  crisis: z.boolean().catch(false),
  facts: z
    .array(z.string())
    .catch([])
    .transform((l) =>
      l
        .map((f) => f.replace(/\s+/g, ' ').trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 2),
    ),
  mood: z.number().int().min(1).max(5).nullish().catch(null),
  action: z
    .object({
      type: z.enum(ACTIONS).catch('none'),
      title: optStr(300),
      remindAt: isoDate,
      withName: optStr(120),
      email: optStr(320),
      windowStart: isoDate,
      windowEnd: isoDate,
      durationMinutes: z.number().int().min(10).max(480).nullish().catch(null),
      to: optStr(320),
      subject: optStr(300),
      body: optStr(5000),
      details: optStr(2000),
      tool: optStr(40),
      request: optStr(500),
    })
    .nullish()
    .catch(null),
});
type TalkOutput = z.infer<typeof talkOutput>;
type ActionOut = NonNullable<TalkOutput['action']>;

interface Meta {
  intent?: TalkIntent | null;
  mood?: number | null;
  crisis?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toTalkMessage(m: AssistantMessageRow): TalkMessage {
  const meta = (m.meta ?? {}) as Meta;
  return {
    id: m.id,
    role: m.role as TalkMessage['role'],
    content: m.content,
    sources: Array.isArray(m.sources) ? (m.sources as unknown as AssistantSource[]) : [],
    actions: Array.isArray(m.actions) ? (m.actions as unknown as TalkAction[]) : [],
    intent: meta.intent ?? null,
    crisis: meta.crisis === true,
    createdAt: m.createdAt.toISOString(),
  };
}

/**
 * Talk with your friend (user-flow §05): every message is answered by the friend in the user's style and
 * relationship stage, grounded in what it remembers (memory search over recordings and meetings). It
 * recognises what the user wants (vent, advice, recall, a task, or just chat), does safe things right away
 * (a reminder) and only proposes things that affect others (a meeting invite, an email) for approval.
 * It learns lasting facts from the chat, except in incognito where nothing is saved or learned.
 */
@Injectable()
export class TalkService {
  private readonly logger = new Logger(TalkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly prompts: PromptsRepository,
    private readonly settings: SettingsService,
    private readonly embeddings: EmbeddingService,
    private readonly context: CompanionContextService,
    private readonly chat: CompanionChatService,
    private readonly reminders: RemindersService,
    private readonly calendar: CalendarWriteService,
    private readonly users: UsersRepository,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async send(userId: string, dto: TalkSendDto): Promise<TalkReply> {
    const user = await this.context.user(userId);
    if (!user) throw AppException.notFound('User');
    const text = dto.text.trim();
    if (!text) throw AppException.validation([{ field: 'text', messages: ['text should not be empty'] }]);
    const incognito = dto.incognito === true;

    let thread = null as { id: string } | null;
    if (!incognito && dto.threadId) {
      thread = await this.prisma.assistantThread.findFirst({
        where: { id: dto.threadId, userId, kind: 'talk' },
        select: { id: true },
      });
      if (!thread) throw AppException.notFound('Conversation');
    }
    const history = incognito
      ? (dto.history ?? []).slice(-HISTORY).map((h) => ({ role: h.role, content: h.content }))
      : thread
        ? (
            await this.prisma.assistantMessage.findMany({
              where: { threadId: thread.id },
              orderBy: { createdAt: 'desc' },
              take: HISTORY,
              select: { role: true, content: true },
            })
          ).reverse()
        : [];

    const quotaKey = await this.consumeQuota(userId);
    try {
      const tz = safeTimeZone(user.timezone);
      const { sources, memory } = await this.memory(userId, text, tz);
      const out = await this.think(user, text, history, memory, tz);
      const actions = out.action ? await this.execute(user, out.action, tz) : [];
      // The reply must match what really happened (never "scheduled" for a proposal, never "set" on failure).
      out.reply = consistentReply(user.lang, out.reply, actions);
      const used = new Set(out.sourcesUsed);
      const cited = out.intent === 'recall' || used.size ? sources.filter((_, i) => used.has(i + 1)) : [];
      const meta: Meta = { intent: out.intent, mood: out.mood ?? null, crisis: out.crisis };
      const now = new Date();

      if (incognito) {
        return {
          threadId: null,
          userMessage: {
            id: randomUUID(),
            role: 'user',
            content: text,
            sources: [],
            actions: [],
            intent: null,
            crisis: false,
            createdAt: now.toISOString(),
          },
          reply: {
            id: randomUUID(),
            role: 'assistant',
            content: out.reply,
            sources: cited,
            actions,
            intent: out.intent,
            crisis: out.crisis,
            createdAt: new Date(now.getTime() + 1).toISOString(),
          },
        };
      }

      thread ??= await this.prisma.assistantThread.create({
        data: { userId, kind: 'talk', title: truncate(text, 80) },
        select: { id: true },
      });
      const userRow = await this.prisma.assistantMessage.create({
        data: { threadId: thread.id, userId, role: 'user', content: text },
      });
      const replyRow = await this.prisma.assistantMessage.create({
        data: {
          threadId: thread.id,
          userId,
          role: 'assistant',
          content: out.reply,
          sources: cited as unknown as Prisma.InputJsonValue,
          actions: actions,
          meta: meta as unknown as Prisma.InputJsonValue,
        },
      });
      await this.prisma.assistantThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
      // Learns: new lasting facts go to "What I know about you" (never in incognito).
      if (out.facts.length) await this.chat.rememberFacts(userId, out.facts);
      this.logger.log(
        { threadId: thread.id, intent: out.intent, actions: actions.map((a) => a.type), sources: cited.length },
        'talk replied',
      );
      return { threadId: thread.id, userMessage: toTalkMessage(userRow), reply: toTalkMessage(replyRow) };
    } catch (err) {
      await this.redis.decr(quotaKey).catch(() => undefined);
      throw err;
    }
  }

  /** Memory search over recordings and meetings (pgvector). Never blocks the chat. */
  private async memory(userId: string, text: string, tz: string) {
    const sources: AssistantSource[] = [];
    const lines: string[] = [];
    try {
      const matches = await this.embeddings.search(userId, text, { k: 6 });
      const meetings = await this.prisma.meeting.findMany({
        where: { userId, id: { in: [...new Set(matches.map((m) => m.meetingId))] } },
        select: { id: true, title: true, startAt: true },
      });
      const byId = new Map(meetings.map((m) => [m.id, m]));
      for (const m of matches) {
        const meeting = byId.get(m.meetingId);
        if (!meeting) continue;
        sources.push({
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          startAt: meeting.startAt.toISOString(),
          snippet: truncate(m.content, 300),
          similarity: m.similarity,
        });
        lines.push(
          `[${sources.length}] ${meeting.title} (${formatDateTime(meeting.startAt, tz)}): ${truncate(m.content, 1200)}`,
        );
      }
    } catch (err) {
      this.logger.warn({ causes: causeChain(err) }, 'talk memory search failed; answering without memory');
    }
    return { sources, memory: lines.length ? lines.join('\n\n') : '(nothing related found in memory)' };
  }

  private fallback(lang: LanguageStyle): TalkOutput {
    return {
      intent: 'chat',
      reply: pick(
        lang,
        "I'm here and listening. I couldn't think that through just now, can you say it again in a moment?",
        'Main yahin hoon, sun raha hoon. Abhi theek se soch nahi paaya, thodi der mein phir se bolo?',
      ),
      sourcesUsed: [],
      crisis: false,
      facts: [],
      mood: null,
      action: null,
    };
  }

  private async think(
    user: CompanionUser,
    text: string,
    history: { role: string; content: string }[],
    memory: string,
    tz: string,
  ): Promise<TalkOutput> {
    if (this.gemini.isMock) return this.fallback(user.lang);
    try {
      const now = new Date();
      const [ai, prompt, branding, calendarState, facts] = await Promise.all([
        this.settings.get('ai'),
        this.prompts.get('talk_chat'),
        this.settings.get('branding'),
        this.calendar.state(user.userId),
        this.context.day(user.userId, tz, dayKey(now, tz)),
      ]);
      if (!prompt) return this.fallback(user.lang);
      const stage = user.profile?.relationshipStage ?? 1;
      const connected = [
        calendarState === 'ok'
          ? 'Google Calendar (can schedule)'
          : calendarState === 'needs_reconnect'
            ? 'Google Calendar (read only: scheduling needs a reconnect in Profile)'
            : null,
      ].filter(Boolean);
      const systemInstruction = renderTemplate(prompt.content, {
        appName: branding.appName,
        userName: user.name ?? 'your friend',
        now: `${formatDateTime(now, tz)}, ${now.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz })}`,
        timezone: `${tz}, ${utcOffset(now, tz)}`,
        profile: this.context.profileText(user),
        dayContext: this.context.dayText(facts, tz),
        stage,
        stageTone: stageTone(stage),
        memory,
        connected: connected.length ? connected.join('; ') : 'none (no calendar, email or task tools)',
      });
      // Not admin-editable: the action contract the code relies on.
      const actionRules =
        '\n\nAction fields: set_reminder MUST have remindAt; schedule_meeting MUST have windowStart and windowEnd; ' +
        'all times are ISO-8601 with the offset above. Use null for fields that do not apply.';
      const contents = [
        ...history.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content.slice(0, 2000) }],
        })),
        { role: 'user', parts: [{ text }] },
      ];
      const { text: raw } = await this.gemini.generateJson({
        operation: 'talk_chat',
        model: ai.model,
        systemInstruction: systemInstruction + actionRules,
        contents,
        temperature: 0.7,
        maxOutputTokens: 4096,
        responseSchema: TALK_SCHEMA,
      });
      const parsed = talkOutput.parse(parseJsonLoose(raw));
      const reply = cleanReply(parsed.reply);
      return reply ? { ...parsed, reply } : this.fallback(user.lang);
    } catch (err) {
      if (err instanceof GeminiBlockedError) {
        return {
          ...this.fallback(user.lang),
          reply: pick(user.lang, "Sorry, I can't help with that.", 'Sorry, isme main madad nahi kar sakta.'),
        };
      }
      this.logger.warn({ causes: causeChain(err) }, 'talk reply fell back');
      return this.fallback(user.lang);
    }
  }

  /** Runs what the user asked for: safe things now, things affecting others only as a proposal. */
  private async execute(user: CompanionUser, a: ActionOut, tz: string): Promise<TalkAction[]> {
    const id = randomUUID();
    const lang = user.lang;
    switch (a.type) {
      case 'set_reminder': {
        const title = a.title ?? a.request ?? 'Reminder';
        if (!a.remindAt || a.remindAt.getTime() <= Date.now() + 60_000) {
          return [
            {
              id,
              type: 'reminder',
              status: 'failed',
              title,
              remindAt: null,
              reminderId: null,
              note: pick(lang, 'Pick a time in the future.', 'Aage ka time batao.'),
            },
          ];
        }
        const row = await this.reminders.createAndSchedule({
          userId: user.userId,
          type: 'custom',
          source: 'ai',
          title,
          body: null,
          remindAt: a.remindAt,
          channels: DEFAULT_REMINDER_CHANNELS,
        });
        return [
          {
            id,
            type: 'reminder',
            status: 'done',
            title,
            remindAt: a.remindAt.toISOString(),
            reminderId: row.id,
            note: null,
          },
        ];
      }
      case 'schedule_meeting':
        return [await this.proposeMeeting(user, a, tz, id)];
      case 'draft_email': {
        const to =
          a.to && EMAIL_RE.test(a.to) ? a.to : ((a.to && (await this.findEmail(user.userId, a.to))?.email) ?? a.to);
        return [
          { id, type: 'email', status: 'proposed', to, subject: a.subject ?? '', body: a.body ?? '', note: null },
        ];
      }
      case 'create_task': {
        const title = a.title ?? a.request ?? 'New task';
        const tool = (a.tool ?? 'app').toLowerCase();
        const item = await this.prisma.actionItem.create({
          data: { userId: user.userId, title, description: a.details, isMine: true, source: 'manual' },
        });
        const toolName = TOOLS[tool];
        return [
          {
            id,
            type: 'task',
            status: 'done',
            title,
            tool: toolName ?? 'app',
            actionItemId: item.id,
            note: toolName
              ? pick(
                  lang,
                  `${toolName} isn't connected yet, so I added it to your to-dos.`,
                  `${toolName} abhi connected nahi hai, isliye maine ise tumhare to-dos mein daal diya.`,
                )
              : null,
          },
        ];
      }
      case 'read_email':
        return [
          {
            id,
            type: 'unavailable',
            status: 'info',
            feature: 'email_read',
            note: pick(
              lang,
              'Reading your email is coming soon. For now I can draft emails for you to send.',
              'Email padhna jaldi aa raha hai. Abhi main email draft kar sakta hoon, jo tum bhejoge.',
            ),
          },
        ];
      default:
        return [];
    }
  }

  /** Free slot from the synced calendar + the guest's email from memory → a proposal to approve. */
  private async proposeMeeting(user: CompanionUser, a: ActionOut, tz: string, id: string): Promise<TalkAction> {
    const lang = user.lang;
    const title = a.title ?? (a.withName ? `Call with ${a.withName}` : 'Meeting');
    const guest =
      a.email && EMAIL_RE.test(a.email)
        ? { name: a.withName, email: a.email }
        : a.withName
          ? await this.findEmail(user.userId, a.withName)
          : null;
    const attendees = guest
      ? [{ name: guest.name ?? a.withName, email: guest.email }]
      : a.withName
        ? [{ name: a.withName, email: null }]
        : [];
    const state = await this.calendar.state(user.userId);
    const base = { id, type: 'meeting' as const, title, attendees, eventId: null };
    if (state !== 'ok') {
      return {
        ...base,
        status: 'needs_connection',
        startAt: null,
        endAt: null,
        note:
          state === 'needs_reconnect'
            ? pick(
                lang,
                'Reconnect Google Calendar in Profile and allow me to add events.',
                'Profile mein Google Calendar reconnect karo aur events add karne ki permission do.',
              )
            : pick(
                lang,
                'Connect Google Calendar in Profile so I can schedule.',
                'Schedule karne ke liye Profile mein Google Calendar connect karo.',
              ),
      };
    }
    const now = new Date();
    const windowStart = a.windowStart && a.windowStart > now ? a.windowStart : new Date(now.getTime() + 60 * 60_000);
    const windowEnd =
      a.windowEnd && a.windowEnd > windowStart ? a.windowEnd : new Date(windowStart.getTime() + 7 * 24 * 3600_000);
    const durationMs = (a.durationMinutes ?? 30) * 60_000;
    const busyRows = await this.prisma.meeting.findMany({
      where: {
        userId: user.userId,
        source: { not: 'capture' },
        status: { notIn: ['cancelled', 'failed'] },
        startAt: { lt: windowEnd, gte: new Date(windowStart.getTime() - 8 * 3600_000) },
      },
      select: { startAt: true, endAt: true },
    });
    const busy = busyRows.map((b) => ({
      start: b.startAt,
      end: b.endAt ?? new Date(b.startAt.getTime() + 30 * 60_000),
    }));
    const slot = findFreeSlot({ busy, windowStart, windowEnd, durationMs, now, timezone: tz });
    const notes = [
      !slot
        ? pick(lang, 'No free slot in that window: pick a time.', 'Us time mein koi free slot nahi: time chuno.')
        : null,
      a.withName && !guest
        ? pick(
            lang,
            `I don't have ${a.withName}'s email: add it before sending.`,
            `Mere paas ${a.withName} ka email nahi hai: bhejne se pehle daal do.`,
          )
        : null,
    ].filter(Boolean);
    return {
      ...base,
      status: 'proposed',
      startAt: slot?.start.toISOString() ?? null,
      endAt: slot?.end.toISOString() ?? null,
      note: notes.length ? notes.join(' ') : null,
    };
  }

  /** A person's email from the attendees of the user's meetings ("finds Rahul's email from memory"). */
  private async findEmail(userId: string, name: string): Promise<{ name: string | null; email: string } | null> {
    const q = name.trim().split(/\s+/)[0];
    if (!q || q.length < 2) return null;
    const rows = await this.prisma.$queryRaw<{ email: string; name: string | null }[]>(Prisma.sql`
      select a->>'email' as email, max(a->>'name') as name
        from public.meetings m, jsonb_array_elements(m.attendees) a
       where m.user_id = ${userId}::uuid
         and coalesce(a->>'email', '') <> ''
         and ((a->>'name') ilike ${q + '%'} or split_part(a->>'email', '@', 1) ilike ${q + '%'})
       group by a->>'email'
       order by count(*) desc
       limit 1`);
    return rows[0] ?? null;
  }

  /** Creates the approved meeting in Google Calendar (Google sends the invites). */
  async schedule(userId: string, dto: TalkScheduleDto) {
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    if (end.getTime() <= start.getTime())
      throw AppException.validation([{ field: 'endAt', messages: ['endAt must be after startAt'] }]);
    if (start.getTime() < Date.now())
      throw AppException.validation([{ field: 'startAt', messages: ['pick a time in the future'] }]);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const created = await this.calendar.createEvent(userId, {
      title: dto.title.trim(),
      startAt: start,
      endAt: end,
      attendees: dto.attendees.map((a) => ({ email: a.email, name: a.name ?? null })),
      timezone: safeTimeZone(user?.timezone ?? 'UTC'),
      description: 'Scheduled with Remi.',
    });
    let message: TalkMessage | null = null;
    if (dto.messageId && dto.actionId) {
      message = await this.patchAction(userId, dto.messageId, dto.actionId, (a) =>
        a.type === 'meeting'
          ? {
              ...a,
              status: 'scheduled',
              title: dto.title.trim(),
              startAt: start.toISOString(),
              endAt: end.toISOString(),
              attendees: dto.attendees.map((x) => ({ name: x.name ?? null, email: x.email })),
              eventId: created.eventId,
              note: null,
            }
          : a,
      );
    }
    return { eventId: created.eventId, htmlLink: created.htmlLink, message };
  }

  /** The user sent the drafted email from their mail app, or dropped a proposal. */
  async setActionStatus(
    userId: string,
    messageId: string,
    actionId: string,
    status: 'sent' | 'cancelled',
  ): Promise<TalkMessage> {
    return this.patchAction(userId, messageId, actionId, (a) => {
      if (a.type === 'email' && (a.status === 'proposed' || a.status === status)) return { ...a, status };
      if (a.type === 'meeting' && status === 'cancelled' && a.status !== 'scheduled')
        return { ...a, status: 'cancelled' };
      throw AppException.conflict('This action cannot be changed');
    });
  }

  private async patchAction(
    userId: string,
    messageId: string,
    actionId: string,
    change: (a: TalkAction) => TalkAction,
  ): Promise<TalkMessage> {
    const row = await this.prisma.assistantMessage.findFirst({
      where: { id: messageId, userId, role: 'assistant', thread: { kind: 'talk' } },
    });
    if (!row) throw AppException.notFound('Message');
    const actions = Array.isArray(row.actions) ? (row.actions as unknown as TalkAction[]) : [];
    const idx = actions.findIndex((a) => a.id === actionId);
    if (idx < 0) throw AppException.notFound('Action');
    actions[idx] = change(actions[idx]);
    const updated = await this.prisma.assistantMessage.update({
      where: { id: row.id },
      data: { actions: actions },
    });
    return toTalkMessage(updated);
  }

  /** Talk shares the daily AI quota of the plan with Ask AI (`aiQueriesPerDay`). */
  private async consumeQuota(userId: string): Promise<string> {
    const key = RedisKeys.aiQuota(userId, new Date().toISOString().slice(0, 10));
    const limits = await this.users.planLimits(userId);
    const used = await this.redis.incr(key);
    if (used === 1) await this.redis.expire(key, 2 * 86_400);
    if (limits.aiQueriesPerDay !== null && used > limits.aiQueriesPerDay) {
      await this.redis.decr(key);
      throw AppException.planLimit(
        `Your plan allows ${limits.aiQueriesPerDay} AI messages per day. Try again tomorrow.`,
      );
    }
    return key;
  }

  async threads(userId: string, page: number, limit: number) {
    const where = { userId, kind: 'talk' };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assistantThread.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.assistantThread.count({ where }),
    ]);
    return Paginated.of(
      rows.map((t) => ({
        id: t.id,
        title: t.title,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      total,
      page,
      limit,
    );
  }

  async messages(userId: string, threadId: string): Promise<TalkMessage[]> {
    const thread = await this.prisma.assistantThread.findFirst({
      where: { id: threadId, userId, kind: 'talk' },
      select: { id: true },
    });
    if (!thread) throw AppException.notFound('Conversation');
    const rows = await this.prisma.assistantMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toTalkMessage);
  }

  async deleteThread(userId: string, threadId: string): Promise<void> {
    const { count } = await this.prisma.assistantThread.deleteMany({ where: { id: threadId, userId, kind: 'talk' } });
    if (!count) throw AppException.notFound('Conversation');
  }
}
