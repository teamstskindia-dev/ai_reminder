import { Injectable, Logger } from '@nestjs/common';
import { Schema, Type } from '@google/genai';
import { z } from 'zod';
import { AppException, causeChain } from '../../common/errors/app.exception';
import { Paginated } from '../../common/pagination/pagination';
import type {
  EmailCategory,
  EmailDetail,
  EmailDetected,
  EmailItem,
  EmailProvider,
  EmailReplyDraft,
  TodayEmails,
} from '../../common/types/api.types';
import { renderTemplate } from '../../common/utils/template.util';
import { safeTimeZone } from '../../common/utils/time.util';
import { GeminiService, parseJsonLoose } from '../../infra/gemini/gemini.service';
import type { ConnectedAccountRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PromptsRepository } from '../ai/prompts.repository';
import { CalendarWriteService } from '../calendar/calendar-write.service';
import { CompanionContextService } from '../companion/companion-context.service';
import { accountSettings, ConnectionsService } from '../connections/connections.service';
import { PROVIDER_NAME } from '../connections/oauth-providers';
import { SettingsService } from '../content/settings.service';
import { DEFAULT_REMINDER_CHANNELS, RemindersService } from '../reminders/reminders.service';
import { normalizeSenders } from '../users/users.service';
import { fetchEmailText, sendEmail } from './email-providers';
import { EMAIL_INCLUDE, type EmailWithAccount, toEmailDetail, toEmailItem } from './email.mapper';
import { replySubject, suggestedRemindAt, toDetected } from './email.util';

export type EmailFilter = 'important' | 'needs_reply' | 'fyi' | 'all';

const NEED_YOU: EmailCategory[] = ['urgent', 'needs_reply'];
const OPEN_STATUSES = ['new', 'alerted', 'held'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REPLY_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: { body: { type: Type.STRING } },
  required: ['body'],
};

function filterWhere(filter: EmailFilter): Prisma.EmailMessageWhereInput {
  switch (filter) {
    case 'important':
      return { category: 'urgent' };
    case 'needs_reply':
      return { category: 'needs_reply' };
    case 'fyi':
      return { category: { in: ['fyi', 'promotion'] } };
    default:
      return { category: { not: 'promotion' } };
  }
}

/**
 * Reading your email (user-flow §07), the API side: what needs the user, summaries, "not important" /
 * "always alert me" learning, reminders from emails, reply drafts in the user's style and sending only
 * after approval from their own account.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: ConnectionsService,
    private readonly context: CompanionContextService,
    private readonly reminders: RemindersService,
    private readonly calendar: CalendarWriteService,
    private readonly gemini: GeminiService,
    private readonly prompts: PromptsRepository,
    private readonly settings: SettingsService,
  ) {}

  private async vip(userId: string): Promise<string[]> {
    const s = await this.prisma.userSettings.findUnique({ where: { userId }, select: { vipSenders: true } });
    return s?.vipSenders ?? [];
  }

  async list(userId: string, filter: EmailFilter, page: number, limit: number): Promise<Paginated<EmailItem>> {
    const where: Prisma.EmailMessageWhereInput = { userId, ...filterWhere(filter) };
    const [rows, total, vip] = await Promise.all([
      this.prisma.emailMessage.findMany({
        where,
        include: EMAIL_INCLUDE,
        orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.emailMessage.count({ where }),
      this.vip(userId),
    ]);
    return Paginated.of(
      rows.map((r) => toEmailItem(r, vip)),
      total,
      page,
      limit,
    );
  }

  private async owned(userId: string, id: string): Promise<EmailWithAccount> {
    const row = await this.prisma.emailMessage.findFirst({ where: { id, userId }, include: EMAIL_INCLUDE });
    if (!row) throw AppException.notFound('Email');
    return row;
  }

  async get(userId: string, id: string): Promise<EmailDetail> {
    return toEmailDetail(await this.owned(userId, id), await this.vip(userId));
  }

  /** Emails on Today: what needs the user (last 3 days) and the FYI digest (last 24 hours). */
  async today(userId: string): Promise<TodayEmails> {
    const account = await this.prisma.connectedAccount.findFirst({
      where: { userId, kind: 'email' },
      select: { id: true },
    });
    if (!account) return { connected: false, needYou: [], needYouCount: 0, fyi: [], fyiCount: 0 };
    const now = Date.now();
    const needWhere: Prisma.EmailMessageWhereInput = {
      userId,
      category: { in: NEED_YOU },
      status: { in: OPEN_STATUSES },
      receivedAt: { gte: new Date(now - 3 * 86_400_000) },
    };
    const fyiWhere: Prisma.EmailMessageWhereInput = {
      userId,
      category: 'fyi',
      status: { in: OPEN_STATUSES },
      receivedAt: { gte: new Date(now - 86_400_000) },
    };
    const [need, needCount, fyi, fyiCount, vip] = await Promise.all([
      this.prisma.emailMessage.findMany({
        where: needWhere,
        include: EMAIL_INCLUDE,
        orderBy: { receivedAt: 'desc' },
        take: 5,
      }),
      this.prisma.emailMessage.count({ where: needWhere }),
      this.prisma.emailMessage.findMany({
        where: fyiWhere,
        include: EMAIL_INCLUDE,
        orderBy: { receivedAt: 'desc' },
        take: 5,
      }),
      this.prisma.emailMessage.count({ where: fyiWhere }),
      this.vip(userId),
    ]);
    // Urgent first, then newest.
    const needYou = need
      .map((r) => toEmailItem(r, vip))
      .sort((a, b) => Number(b.category === 'urgent') - Number(a.category === 'urgent'));
    return { connected: true, needYou, needYouCount: needCount, fyi: fyi.map((r) => toEmailItem(r, vip)), fyiCount };
  }

  /**
   * "Not important" teaches the friend to stop alerting on that sender; "always alert me" makes them a VIP
   * whose emails break through quiet hours.
   */
  async feedback(userId: string, id: string, kind: 'not_important' | 'always_alert'): Promise<EmailDetail> {
    const row = await this.owned(userId, id);
    const sender = row.fromEmail;
    const s = await this.prisma.userSettings.findUnique({ where: { userId } });
    if (sender && s) {
      const vip = s.vipSenders.filter((x) => x !== sender);
      const muted = s.mutedSenders.filter((x) => x !== sender);
      await this.prisma.userSettings.update({
        where: { userId },
        data:
          kind === 'not_important'
            ? { vipSenders: vip, mutedSenders: normalizeSenders([...muted, sender]).slice(-500) }
            : { vipSenders: normalizeSenders([...vip, sender]).slice(-100), mutedSenders: muted },
      });
    }
    const data: Prisma.EmailMessageUpdateInput =
      kind === 'not_important'
        ? {
            status: 'dismissed',
            ...(row.category === 'urgent' || row.category === 'needs_reply' ? { category: 'fyi' } : {}),
          }
        : row.category === 'fyi' || row.category === 'needs_reply'
          ? { category: 'urgent' }
          : {};
    if (Object.keys(data).length) await this.prisma.emailMessage.update({ where: { id }, data });
    return this.get(userId, id);
  }

  async setStatus(userId: string, id: string, status: 'done' | 'new'): Promise<EmailDetail> {
    await this.owned(userId, id);
    await this.prisma.emailMessage.update({ where: { id }, data: { status } });
    return this.get(userId, id);
  }

  /** "Remind me later": a reminder about this email. */
  async remind(userId: string, id: string, remindAt: Date, title?: string): Promise<EmailDetail> {
    const row = await this.owned(userId, id);
    if (remindAt.getTime() <= Date.now() + 30_000) {
      throw AppException.validation([{ field: 'remindAt', messages: ['remindAt must be in the future'] }]);
    }
    const sender = row.fromName ?? row.fromEmail ?? 'email';
    const reminder = await this.reminders.createAndSchedule({
      userId,
      type: 'custom',
      source: 'manual',
      title: (title?.trim() || `Reply to ${sender}${row.subject ? `: ${row.subject}` : ''}`).slice(0, 300),
      body: row.summary,
      remindAt,
      channels: DEFAULT_REMINDER_CHANNELS,
    });
    await this.prisma.emailMessage.update({ where: { id }, data: { reminderId: reminder.id } });
    return this.get(userId, id);
  }

  /** Confirms (as a reminder or a calendar event) or dismisses a deadline / bill / booking the email mentioned. */
  async resolveDetected(
    userId: string,
    id: string,
    detectedId: string,
    action: 'reminder' | 'calendar' | 'dismiss',
    remindAt?: Date,
  ): Promise<EmailDetail> {
    const row = await this.owned(userId, id);
    const list = toDetected(row.detected);
    const item = list.find((d) => d.id === detectedId);
    if (!item) throw AppException.notFound('Detected item');
    if (item.status !== 'open') throw AppException.conflict('This was already handled');
    let next: EmailDetected = { ...item, status: 'dismissed' };
    if (action === 'reminder') {
      const at = remindAt ?? suggestedRemindAt(item.dueAt ? new Date(item.dueAt) : null);
      if (at.getTime() <= Date.now()) {
        throw AppException.validation([{ field: 'remindAt', messages: ['remindAt must be in the future'] }]);
      }
      const reminder = await this.reminders.createAndSchedule({
        userId,
        type: 'custom',
        source: 'ai',
        title: item.title,
        body: row.subject ? `From the email "${row.subject}"` : null,
        remindAt: at,
        channels: DEFAULT_REMINDER_CHANNELS,
      });
      next = { ...item, status: 'added', reminderId: reminder.id };
    } else if (action === 'calendar') {
      if (!item.dueAt) throw AppException.conflict('This has no date to add to your calendar');
      const state = await this.calendar.state(userId);
      if (state !== 'ok') {
        throw AppException.conflict(
          state === 'needs_reconnect'
            ? 'Reconnect Google Calendar in Profile and allow adding events.'
            : 'Connect Google Calendar in Profile first.',
        );
      }
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
      const start = new Date(item.dueAt);
      await this.calendar.createEvent(userId, {
        title: item.title,
        startAt: start,
        endAt: new Date(start.getTime() + (item.kind === 'travel' ? 120 : 30) * 60_000),
        attendees: [],
        timezone: safeTimeZone(user?.timezone ?? 'UTC'),
        description: row.subject ? `From the email "${row.subject}". Added by Remi.` : 'Added by Remi.',
      });
      next = { ...item, status: 'added' };
    }
    await this.prisma.emailMessage.update({
      where: { id },
      data: { detected: list.map((d) => (d.id === detectedId ? next : d)) as unknown as Prisma.InputJsonValue },
    });
    return this.get(userId, id);
  }

  private async liveAccount(row: EmailWithAccount): Promise<ConnectedAccountRow> {
    const account = await this.prisma.connectedAccount.findUnique({ where: { id: row.accountId } });
    if (!account) throw AppException.conflict('That email account is no longer connected.');
    return account;
  }

  /** Drafts a reply in the user's writing style (the email is read live, never stored). Nothing is sent. */
  async draftReply(userId: string, id: string, instructions?: string): Promise<EmailReplyDraft> {
    const row = await this.owned(userId, id);
    if (row.category === 'phishing') throw AppException.conflict('This looks like phishing, so I won’t reply to it.');
    const account = await this.liveAccount(row);
    const provider = account.provider as EmailProvider;
    const canSend = accountSettings(account).canSend === true;
    const to = row.fromEmail ?? '';
    const subject = replySubject(row.subject);
    const user = await this.context.user(userId);
    const name = user?.name ?? 'Me';
    const fallbackBody = `Hi ${row.fromName?.split(/\s+/)[0] ?? ''},\n\n${instructions?.trim() || 'Thanks for your email. [your reply]'}\n\n${name.split(/\s+/)[0]}`;
    if (this.gemini.isMock || row.category === 'sensitive') return { to, subject, body: fallbackBody, canSend };
    try {
      const text = await this.connections.withToken(account, (token) =>
        fetchEmailText(provider, token, row.providerMessageId),
      );
      const [ai, prompt] = await Promise.all([this.settings.get('ai'), this.prompts.get('email_reply')]);
      if (!prompt) return { to, subject, body: fallbackBody, canSend };
      const style = user ? this.context.profileText(user) : '(nothing yet)';
      const { text: raw } = await this.gemini.generateJson({
        operation: 'email_reply',
        model: ai.model,
        systemInstruction: renderTemplate(prompt.content, {
          userName: name,
          style,
          instructions: instructions?.trim() || 'a short, friendly reply that answers what they asked',
        }),
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `From: ${row.fromName ?? ''} <${to}>\nSubject: ${row.subject ?? ''}\n---\n${text.slice(0, 4000)}`,
              },
            ],
          },
        ],
        temperature: 0.5,
        maxOutputTokens: 1024,
        responseSchema: REPLY_SCHEMA,
      });
      const body = z.object({ body: z.string() }).parse(parseJsonLoose(raw)).body.trim();
      return { to, subject, body: body || fallbackBody, canSend };
    } catch (err) {
      if (err instanceof AppException && err.code === 'CONFLICT') throw err;
      this.logger.warn({ causes: causeChain(err) }, 'reply draft fell back');
      return { to, subject, body: fallbackBody, canSend };
    }
  }

  /** Sends the reply the user approved, threaded, from their own account. */
  async sendReply(
    userId: string,
    id: string,
    draft: { to: string; subject: string; body: string },
  ): Promise<EmailDetail> {
    const row = await this.owned(userId, id);
    const account = await this.liveAccount(row);
    await this.send(account, {
      ...draft,
      replyToMessageId: row.providerMessageId,
      replyToThreadId: row.providerThreadId,
    });
    await this.prisma.emailMessage.update({ where: { id }, data: { status: 'replied' } });
    return this.get(userId, id);
  }

  /** Talk: sends an approved email (a reply when `replyToEmailId` is set) from the connected account. */
  async sendFromAccount(
    userId: string,
    draft: { to: string; subject: string; body: string; replyToEmailId?: string | null },
  ): Promise<void> {
    if (draft.replyToEmailId) {
      await this.sendReply(userId, draft.replyToEmailId, draft);
      return;
    }
    const account = await this.connections.emailAccount(userId);
    if (!account) throw AppException.conflict('Connect Gmail or Outlook in Connected apps to send from your account.');
    await this.send(account, draft);
  }

  private async send(
    account: ConnectedAccountRow,
    e: { to: string; subject: string; body: string; replyToMessageId?: string | null; replyToThreadId?: string | null },
  ): Promise<void> {
    const provider = account.provider as EmailProvider;
    if (account.status !== 'connected') {
      throw AppException.conflict(`Reconnect ${PROVIDER_NAME[provider]} in Connected apps to send.`);
    }
    if (accountSettings(account).canSend !== true) {
      throw AppException.conflict(
        `${PROVIDER_NAME[provider]} is connected read-only. Reconnect it with sending allowed, or send from your email app.`,
      );
    }
    const to = e.to.trim();
    if (!EMAIL_RE.test(to)) throw AppException.validation([{ field: 'to', messages: ['to must be an email address'] }]);
    if (!e.body.trim()) throw AppException.validation([{ field: 'body', messages: ['body should not be empty'] }]);
    await this.connections.withToken(account, (token) =>
      sendEmail(provider, token, {
        to,
        subject: e.subject,
        body: e.body,
        replyToMessageId: e.replyToMessageId,
        replyToThreadId: e.replyToThreadId,
      }),
    );
    this.logger.log({ provider, reply: Boolean(e.replyToMessageId) }, 'email sent after approval');
  }

  async syncNow(userId: string): Promise<{ queued: true }> {
    const account = await this.connections.emailAccount(userId);
    if (!account) throw AppException.conflict('Connect Gmail or Outlook first.');
    if (account.status !== 'connected') throw AppException.conflict('Reconnect your email in Connected apps first.');
    await this.connections.enqueueEmailSync(account.id);
    return { queued: true };
  }

  // ---------------------------------------------------------------- Talk helpers

  async isConnected(userId: string): Promise<{ connected: boolean; canSend: boolean; provider: EmailProvider | null }> {
    const account = await this.connections.emailAccount(userId);
    return {
      connected: account?.status === 'connected',
      canSend: account?.status === 'connected' && accountSettings(account).canSend === true,
      provider: (account?.provider as EmailProvider) ?? null,
    };
  }

  /** "Summarize my mails today": grouped important, needs reply, FYI. */
  async summary(userId: string, since: Date): Promise<{ label: string; items: EmailItem[] }[]> {
    const [rows, vip] = await Promise.all([
      this.prisma.emailMessage.findMany({
        where: { userId, receivedAt: { gte: since }, category: { in: ['urgent', 'needs_reply', 'fyi', 'phishing'] } },
        include: EMAIL_INCLUDE,
        orderBy: { receivedAt: 'desc' },
        take: 40,
      }),
      this.vip(userId),
    ]);
    const items = rows.map((r) => toEmailItem(r, vip));
    return [
      { label: 'Important', items: items.filter((i) => i.category === 'urgent').slice(0, 5) },
      { label: 'Needs a reply', items: items.filter((i) => i.category === 'needs_reply').slice(0, 5) },
      { label: 'FYI', items: items.filter((i) => i.category === 'fyi').slice(0, 5) },
      { label: 'Looks like phishing', items: items.filter((i) => i.category === 'phishing').slice(0, 3) },
    ].filter((g) => g.items.length);
  }

  /** "Anything from HDFC this week?": sender name / address / domain or a keyword in the subject or summary. */
  async search(
    userId: string,
    q: { from?: string | null; keyword?: string | null; since: Date },
  ): Promise<EmailItem[]> {
    const and: Prisma.EmailMessageWhereInput[] = [];
    const from = q.from?.trim();
    if (from) {
      and.push({
        OR: [
          { fromName: { contains: from, mode: 'insensitive' } },
          { fromEmail: { contains: from.toLowerCase().replace(/\s+/g, '') } },
        ],
      });
    }
    const keyword = q.keyword?.trim();
    if (keyword) {
      and.push({
        OR: [
          { subject: { contains: keyword, mode: 'insensitive' } },
          { summary: { contains: keyword, mode: 'insensitive' } },
          { fromName: { contains: keyword, mode: 'insensitive' } },
          { fromEmail: { contains: keyword.toLowerCase() } },
        ],
      });
    }
    const [rows, vip] = await Promise.all([
      this.prisma.emailMessage.findMany({
        where: { userId, receivedAt: { gte: q.since }, category: { not: 'promotion' }, AND: and },
        include: EMAIL_INCLUDE,
        orderBy: { receivedAt: 'desc' },
        take: 8,
      }),
      this.vip(userId),
    ]);
    return rows.map((r) => toEmailItem(r, vip));
  }

  /** The latest email from someone ("reply to Neha"). */
  async latestFrom(
    userId: string,
    name: string,
  ): Promise<{ id: string; fromEmail: string | null; subject: string | null } | null> {
    const q = name.trim().split(/\s+/)[0];
    if (!q || q.length < 2) return null;
    return this.prisma.emailMessage.findFirst({
      where: {
        userId,
        category: { notIn: ['promotion', 'phishing', 'sensitive'] },
        OR: [{ fromName: { contains: q, mode: 'insensitive' } }, { fromEmail: { startsWith: q.toLowerCase() } }],
      },
      orderBy: { receivedAt: 'desc' },
      select: { id: true, fromEmail: true, subject: true },
    });
  }
}
