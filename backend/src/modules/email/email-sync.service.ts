import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { causeChain } from '../../common/errors/app.exception';
import type { EmailProvider } from '../../common/types/api.types';
import { safeTimeZone } from '../../common/utils/time.util';
import type { ConnectedAccountRow, EmailMessageRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { upsertJob } from '../../infra/queue/job-utils';
import { EmailBundleJob, EmailSyncJob, JOB, JobId, QUEUE } from '../../infra/queue/queue.constants';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';
import { CompanionContextService } from '../companion/companion-context.service';
import { ConnectionsService, ReconnectRequiredError } from '../connections/connections.service';
import { PROVIDER_NAME } from '../connections/oauth-providers';
import { DeliveryService } from '../notifications/delivery.service';
import { nextHour } from '../notifications/notification-policy';
import { fetchNew, type RawEmail } from './email-providers';
import { EmailTriageService, type Triage } from './email-triage.service';
import { ruleCategory, senderMatches } from './email.util';

const PAGE = 200;
/** Inbox flood: at most this many important-email pushes per hour; the rest come as one. */
export const EMAIL_PUSHES_PER_HOUR = 3;
/** Only fresh mail is pushed (the first sync reads the last day but never alerts on it). */
const ALERT_MAX_AGE_MS = 3 * 3600_000;
/** What the friend keeps from email is pruned after this. */
const RETENTION_DAYS = 30;

/**
 * Reads connected inboxes every few minutes (user-flow §07): new emails are sorted by the AI, kept as a
 * one-line summary (never the body; sensitive mail keeps nothing), and only urgent or VIP mail is pushed,
 * respecting quiet hours, muted senders and an hourly cap so an inbox flood becomes one push.
 */
@Injectable()
export class EmailSyncService {
  private readonly logger = new Logger(EmailSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: ConnectionsService,
    private readonly triage: EmailTriageService,
    private readonly context: CompanionContextService,
    private readonly delivery: DeliveryService,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(QUEUE.INTEGRATIONS) private readonly queue: Queue,
  ) {}

  /** Repeatable tick: one sync job per connected inbox. */
  async poll(): Promise<{ queued: number }> {
    let cursor: string | null = null;
    let queued = 0;
    for (;;) {
      const page: { id: string }[] = await this.prisma.connectedAccount.findMany({
        where: {
          kind: 'email',
          status: 'connected',
          user: { status: 'active' },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: PAGE,
      });
      for (const a of page) {
        const res = await upsertJob<EmailSyncJob>(
          this.queue,
          JOB.EMAIL_SYNC,
          { accountId: a.id },
          { jobId: JobId.emailSync(a.id) },
          'keep',
        );
        if (res.added) queued++;
      }
      if (page.length < PAGE) break;
      cursor = page[page.length - 1].id;
    }
    return { queued };
  }

  async sync(accountId: string): Promise<{ fetched: number; stored: number; alerted: number }> {
    const account = await this.prisma.connectedAccount.findUnique({ where: { id: accountId } });
    if (!account || account.status !== 'connected' || account.kind !== 'email')
      return { fetched: 0, stored: 0, alerted: 0 };
    const provider = account.provider as EmailProvider;
    const firstSync = !account.syncCursor;

    let fetched: { emails: RawEmail[]; cursor: string | null };
    try {
      fetched = await this.connections.withToken(account, (token) => fetchNew(provider, token, account.syncCursor));
    } catch (err) {
      if (err instanceof ReconnectRequiredError) return { fetched: 0, stored: 0, alerted: 0 };
      throw err;
    }

    const known = new Set(
      (
        await this.prisma.emailMessage.findMany({
          where: { accountId, providerMessageId: { in: fetched.emails.map((e) => e.id) } },
          select: { providerMessageId: true },
        })
      ).map((r) => r.providerMessageId),
    );
    const fresh = fetched.emails.filter((e) => !known.has(e.id));
    const stored = fresh.length ? await this.store(account, fresh) : [];

    await this.prisma.connectedAccount.update({
      where: { id: accountId },
      data: { syncCursor: fetched.cursor, lastSyncedAt: new Date(), lastError: null },
    });
    await this.prisma.emailMessage.deleteMany({
      where: { accountId, receivedAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) } },
    });

    const alerted = firstSync ? 0 : await this.alert(account, stored);
    if (stored.length) this.logger.log({ provider, stored: stored.length, alerted }, 'emails synced');
    return { fetched: fetched.emails.length, stored: stored.length, alerted };
  }

  private async store(account: ConnectedAccountRow, emails: RawEmail[]): Promise<EmailMessageRow[]> {
    const user = await this.context.user(account.userId);
    const owner = await this.prisma.user.findUnique({ where: { id: account.userId }, select: { email: true } });
    if (!user) return [];
    const vip = user.settings.vipSenders;
    const muted = user.settings.mutedSenders;

    const ruled = emails.map((e) =>
      ruleCategory({ fromEmail: e.fromEmail, subject: e.subject, text: e.text, labels: e.labels, vip, muted }),
    );
    const toAsk = emails.filter((_, i) => ruled[i] === null || ruled[i] === 'fyi');
    let triaged: Triage[] = [];
    try {
      triaged = await this.triage.triage(
        {
          userName: user.name ?? 'the user',
          userEmail: account.accountLabel ?? owner?.email ?? '',
          profile: this.context.profileText(user),
          timezone: safeTimeZone(user.timezone),
          vip,
          muted,
        },
        toAsk,
      );
    } catch (err) {
      this.logger.warn({ causes: causeChain(err) }, 'email triage failed');
    }
    const byId = new Map(toAsk.map((e, i) => [e.id, triaged[i]]));

    const rows: Prisma.EmailMessageUncheckedCreateInput[] = [];
    emails.forEach((e, i) => {
      const rule = ruled[i];
      const t = byId.get(e.id);
      const isVip = senderMatches(vip, e.fromEmail);
      let category = rule === 'sensitive' ? 'sensitive' : (t?.category ?? rule ?? 'fyi');
      // Muted senders never alert; VIPs always do (unless it is phishing).
      if (rule === 'fyi' && (category === 'urgent' || category === 'needs_reply')) category = 'fyi';
      if (isVip && category !== 'phishing' && category !== 'sensitive') category = 'urgent';
      const sensitive = category === 'sensitive';
      rows.push({
        userId: account.userId,
        accountId: account.id,
        providerMessageId: e.id,
        providerThreadId: e.threadId,
        fromName: e.fromName?.slice(0, 200) ?? null,
        fromEmail: e.fromEmail?.slice(0, 320) ?? null,
        subject: sensitive ? null : (e.subject?.slice(0, 300) ?? null),
        summary: sensitive ? null : (t?.summary ?? null),
        why: sensitive
          ? 'Codes, passwords and statements are never kept'
          : category === 'phishing'
            ? 'Looks like phishing: don’t open links or attachments'
            : (t?.why ?? (isVip ? 'From someone you always want to hear from' : null)),
        category,
        status: category === 'promotion' ? 'dismissed' : 'new',
        detected: (sensitive ? [] : (t?.detected ?? [])) as unknown as Prisma.InputJsonValue,
        receivedAt: e.receivedAt,
      });
    });

    const created: EmailMessageRow[] = [];
    for (const data of rows) {
      try {
        created.push(await this.prisma.emailMessage.create({ data }));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue; // raced
        throw err;
      }
    }
    return created;
  }

  /** Pushes urgent mail (and VIPs) while the user has email alerts on; an inbox flood becomes one push. */
  private async alert(account: ConnectedAccountRow, rows: EmailMessageRow[]): Promise<number> {
    const user = await this.context.user(account.userId);
    if (!user || !user.settings.emailAlerts) return 0;
    const now = Date.now();
    const urgent = rows
      .filter((r) => r.category === 'urgent' && now - r.receivedAt.getTime() < ALERT_MAX_AGE_MS)
      .filter((r) => !senderMatches(user.settings.mutedSenders, r.fromEmail));
    let alerted = 0;
    const hourKey = new Date().toISOString().slice(0, 13).replace(/\D/g, '');
    for (const r of urgent) {
      const isVip = senderMatches(user.settings.vipSenders, r.fromEmail);
      const countKey = RedisKeys.emailPushes(account.userId, hourKey);
      const count = await this.redis.incr(countKey);
      if (count === 1) await this.redis.expire(countKey, 2 * 3600);
      if (count > EMAIL_PUSHES_PER_HOUR && !isVip) {
        await this.queueBundle(account.userId, hourKey);
        continue;
      }
      const sender = r.fromName ?? r.fromEmail ?? PROVIDER_NAME[account.provider as EmailProvider];
      const vars = {
        title: `${isVip ? '⭐ ' : ''}${sender}: ${r.subject ?? 'Important email'}`.slice(0, 200),
        body:
          [r.summary, r.why ? `Why it matters: ${r.why}` : null].filter(Boolean).join(' · ') ||
          'Tap to read the summary.',
      };
      const res = await this.delivery.deliver({
        userId: account.userId,
        type: 'email_important',
        templateKey: 'email_important',
        vars,
        fallback: vars,
        breakThrough: isVip,
        data: { emailId: r.id, url: `/email/${r.id}` },
      });
      await this.prisma.emailMessage.update({
        where: { id: r.id },
        data: { status: res.push === 'hold' ? 'held' : 'alerted', alertedAt: new Date() },
      });
      alerted++;
    }
    return alerted;
  }

  private async queueBundle(userId: string, hourKey: string): Promise<void> {
    const heldKey = RedisKeys.emailHeld(userId, hourKey);
    const held = await this.redis.incr(heldKey);
    if (held === 1) await this.redis.expire(heldKey, 3 * 3600);
    const release = nextHour(new Date());
    await upsertJob<EmailBundleJob>(
      this.queue,
      JOB.EMAIL_BUNDLE,
      { userId, hourKey },
      { jobId: JobId.emailBundle(userId, hourKey), delay: Math.max(0, release.getTime() - Date.now()) },
      'keep',
    );
  }

  /** Worker: "N more important emails" for the ones over the hourly cap. */
  async sendBundle(job: EmailBundleJob): Promise<'sent' | 'skipped'> {
    const count = Number(await this.redis.getdel(RedisKeys.emailHeld(job.userId, job.hourKey))) || 0;
    if (!count) return 'skipped';
    const vars = {
      title: `${count} more important email${count === 1 ? '' : 's'}`,
      body: 'Your inbox got busy. Tap to see what needs you.',
    };
    await this.delivery.deliver({
      userId: job.userId,
      type: 'email_bundle',
      templateKey: 'email_bundle',
      vars,
      fallback: vars,
      data: { url: '/emails' },
    });
    return 'sent';
  }
}
