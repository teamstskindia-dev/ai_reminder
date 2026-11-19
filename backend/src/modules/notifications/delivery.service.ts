import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { UpstreamError, causeChain } from '../../common/errors/app.exception';
import type {
  AppNotification,
  NotificationPriority,
  NotificationType,
  ReminderChannel,
} from '../../common/types/api.types';
import { sha1 } from '../../common/utils/crypto.util';
import { safeTimeZone, zonedParts } from '../../common/utils/time.util';
import { escapeHtml, renderTemplate, TemplateVars } from '../../common/utils/template.util';
import { MailService } from '../../infra/mail/mail.service';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PushService } from '../../infra/push/push.service';
import { upsertJob } from '../../infra/queue/job-utils';
import { HeldPushJob, JOB, JobId, PushBundleJob, QUEUE } from '../../infra/queue/queue.constants';
import { RealtimeEmitter } from '../../infra/realtime/realtime-emitter.service';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';
import { dayKey } from '../companion/rhythm.util';
import { SettingsService } from '../content/settings.service';
import { DevicesRepository } from '../devices/devices.repository';
import { normalizeChannels } from '../reminders/reminders.mapper';
import { UsersRepository } from '../users/users.repository';
import { countsAgainstBudget, decidePush, PRIORITY, type PushDecision } from './notification-policy';
import { toNotification } from './notifications.mapper';
import { NotificationsRepository, TemplatesRepository } from './notifications.repository';

export interface DeliveryInput {
  userId: string;
  type: NotificationType;
  /** notification_templates key; omitted for broadcasts (raw title/body). */
  templateKey?: string;
  vars?: TemplateVars;
  data?: Record<string, unknown>;
  /** Overrides the template's channels. */
  channels?: ReminderChannel[];
  /** Used when there is no (active) template. */
  fallback?: { title: string; body: string | null };
  /** Push category with action buttons (see the app's notification categories). */
  categoryId?: string;
  /** Overrides the type's default priority (user-flow §09). */
  priority?: NotificationPriority;
  /** May break through quiet hours (e.g. a VIP sender). */
  breakThrough?: boolean;
  /** Skip quiet hours, the budget and de-duplication (held pushes and bundles already went through them). */
  skipPolicy?: boolean;
}

export interface DeliveryResult {
  notification: AppNotification | null;
  delivered: ReminderChannel[];
  skipped: boolean;
  /** What happened to the push (absent when no push was requested or push is off). */
  push?: PushDecision['action'];
}

/** The same notification within this window is merged into one ("same reminder from two sources"). */
const DEDUPE_SECONDS = 10 * 60;
const COUNTER_TTL_SECONDS = 2 * 86_400;

/**
 * Renders a notification template and fans it out to in-app (row + socket), push (Expo) and email
 * (SMTP), honouring global switches, feature flags and the user's preferences. Pushes follow the
 * notification rulebook (user-flow §09): priority, quiet hours and focus mode, the daily push budget with
 * bundling, and merging duplicates. Template variables are HTML-escaped for email; push/email failures
 * never block in-app delivery.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly templates: TemplatesRepository,
    private readonly notifications: NotificationsRepository,
    private readonly devices: DevicesRepository,
    private readonly users: UsersRepository,
    private readonly settings: SettingsService,
    private readonly push: PushService,
    private readonly mail: MailService,
    private readonly realtime: RealtimeEmitter,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(QUEUE.NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  async deliver(input: DeliveryInput): Promise<DeliveryResult> {
    const vars = input.vars ?? {};
    const template = input.templateKey ? await this.templates.get(input.templateKey) : null;
    if (input.templateKey && (!template || !template.isActive) && !input.fallback) {
      this.logger.log({ templateKey: input.templateKey }, 'template missing or inactive; notification skipped');
      return { notification: null, delivered: [], skipped: true };
    }
    const useTemplate = template && template.isActive;
    const title = (useTemplate ? renderTemplate(template.titleTemplate, vars) : (input.fallback?.title ?? '')).slice(
      0,
      300,
    );
    const body = useTemplate ? renderTemplate(template.bodyTemplate, vars) : (input.fallback?.body ?? null);
    const channels = input.channels ?? (useTemplate ? normalizeChannels(template.channels) : ['in_app', 'push']);

    const user = await this.users.findById(input.userId);
    if (!user || user.status !== 'active') return { notification: null, delivered: [], skipped: true };
    const [prefs, notif, features] = await Promise.all([
      this.users.getSettings(input.userId),
      this.settings.get('notifications'),
      this.settings.get('features'),
    ]);

    // Two reminders for the same thing (from a recording and from chat) merge; two different captures,
    // emails or meetings that happen to read the same never do.
    const subject = ['captureId', 'emailId', 'meetingId', 'nudgeId', 'toolTaskId', 'broadcastId']
      .map((k) => input.data?.[k])
      .filter((v) => typeof v === 'string')
      .join(',');
    const dedupeKey = input.skipPolicy
      ? null
      : RedisKeys.notifDedupe(
          input.userId,
          sha1(`${input.type}|${subject}|${title.toLowerCase()}|${(body ?? '').toLowerCase()}`),
        );
    if (dedupeKey && (await this.redis.set(dedupeKey, '1', 'EX', DEDUPE_SECONDS, 'NX')) !== 'OK') {
      this.logger.log({ type: input.type }, 'duplicate notification merged');
      return { notification: null, delivered: [], skipped: true };
    }

    const delivered: ReminderChannel[] = [];
    const failures: unknown[] = [];
    let notification: AppNotification | null = null;
    let pushAction: PushDecision['action'] | undefined;

    if (channels.includes('in_app')) {
      const row = await this.notifications.create({
        userId: input.userId,
        type: input.type,
        title,
        body,
        data: (input.data ?? {}) as Prisma.InputJsonValue,
      });
      notification = toNotification(row);
      this.realtime.toUser(input.userId, 'notification:new', notification);
      delivered.push('in_app');
    }

    if (channels.includes('push') && notif.pushEnabled && features.pushNotifications && prefs.pushNotifications) {
      const priority = input.priority ?? PRIORITY[input.type] ?? 'normal';
      const tz = safeTimeZone(user.timezone);
      const now = new Date();
      const decision: PushDecision = input.skipPolicy
        ? { action: 'send' }
        : decidePush({
            priority,
            type: input.type,
            now,
            timezone: tz,
            settings: prefs,
            sentToday: Number(await this.redis.get(RedisKeys.pushBudget(input.userId, dayKey(now, tz)))) || 0,
            breakThrough: input.breakThrough,
          });
      pushAction = decision.action;
      const payload = {
        title,
        body: body ?? '',
        categoryId: input.categoryId,
        data: {
          ...(input.data ?? {}),
          type: input.type,
          ...(notification ? { notificationId: notification.id } : {}),
        },
      };
      try {
        if (decision.action === 'send') {
          if (await this.sendPush(input.userId, payload)) {
            delivered.push('push');
            await this.afterPush(input.userId, tz, countsAgainstBudget(priority, input.type));
          }
        } else if (decision.action === 'hold') {
          await this.holdPush(input.userId, notification?.id ?? null, input.type, payload, decision.until);
        } else if (decision.action === 'bundle') {
          await this.addToBundle(input.userId, decision.releaseAt);
        }
      } catch (err) {
        failures.push(err);
        this.logger.warn({ channel: 'push', causes: causeChain(err) }, 'push delivery failed');
      }
    }

    if (channels.includes('email') && this.mail.configured && notif.emailEnabled && prefs.emailNotifications) {
      try {
        const subjectTpl = (useTemplate && template.emailSubject) || (useTemplate ? template.titleTemplate : title);
        const bodyTpl = (useTemplate && template.emailBody) || (useTemplate ? template.bodyTemplate : (body ?? ''));
        await this.mail.send({
          to: user.email,
          subject: useTemplate ? renderTemplate(subjectTpl, vars) : title,
          markdown: useTemplate ? renderTemplate(bodyTpl, vars, escapeHtml) : escapeHtml(bodyTpl),
          text: useTemplate ? renderTemplate(bodyTpl, vars) : bodyTpl,
          fromName: notif.fromName,
          fromEmail: notif.fromEmail,
        });
        delivered.push('email');
      } catch (err) {
        failures.push(err);
        this.logger.warn({ channel: 'email', causes: causeChain(err) }, 'email delivery failed');
      }
    }

    this.logger.log(
      {
        type: input.type,
        templateKey: input.templateKey,
        requested: channels,
        delivered,
        push: pushAction,
        failed: failures.length,
      },
      'notification delivered',
    );
    // Nothing went out and something failed → let the job retry (no in-app row was written in that case).
    if (!delivered.length && failures.length) {
      if (dedupeKey) await this.redis.del(dedupeKey).catch(() => undefined);
      throw failures[0] instanceof UpstreamError ? failures[0] : new UpstreamError('expo', undefined, failures[0]);
    }
    return { notification, delivered, skipped: false, push: pushAction };
  }

  private async sendPush(
    userId: string,
    payload: { title: string; body: string; categoryId?: string; data: Record<string, unknown> },
  ): Promise<boolean> {
    const tokens = await this.devices.tokensForUser(userId);
    if (!tokens.length) return false;
    const res = await this.push.send(tokens, payload);
    if (res.invalidTokens.length) await this.devices.deleteTokens(res.invalidTokens);
    return res.sent > 0;
  }

  /** Counts the push against the daily budget and records the hour it went out (learning timing). */
  private async afterPush(userId: string, tz: string, budgeted: boolean): Promise<void> {
    const now = new Date();
    if (budgeted) {
      const key = RedisKeys.pushBudget(userId, dayKey(now, tz));
      await this.redis.incr(key);
      await this.redis.expire(key, COUNTER_TTL_SECONDS);
    }
    await this.recordEngagement(userId, zonedParts(now, tz).hour, 0).catch(() => undefined);
  }

  /** Adds one push sent (index 0) or opened (index 1) at a local hour to user_settings.push_engagement. */
  async recordEngagement(userId: string, hour: number, index: 0 | 1): Promise<void> {
    const h = String(hour);
    await this.prisma.$executeRaw(Prisma.sql`
      update public.user_settings
         set push_engagement = jsonb_set(
               push_engagement,
               array[${h}]::text[],
               jsonb_build_array(
                 coalesce((push_engagement->${h}->>0)::int, 0) + ${index === 0 ? 1 : 0},
                 coalesce((push_engagement->${h}->>1)::int, 0) + ${index === 1 ? 1 : 0}
               ),
               true)
       where user_id = ${userId}::uuid`);
  }

  private async holdPush(
    userId: string,
    notificationId: string | null,
    type: NotificationType,
    payload: { title: string; body: string; categoryId?: string; data: Record<string, unknown> },
    until: Date,
  ): Promise<void> {
    const id = notificationId ?? sha1(`${userId}|${type}|${payload.title}|${until.getTime()}`).slice(0, 32);
    await upsertJob<HeldPushJob>(
      this.queue,
      JOB.HELD_PUSH,
      {
        userId,
        notificationId,
        type,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        categoryId: payload.categoryId,
      },
      { jobId: JobId.heldPush(id), delay: Math.max(0, until.getTime() - Date.now()) },
      'keep',
    );
  }

  private async addToBundle(userId: string, releaseAt: Date, count = 1): Promise<void> {
    const counterKey = RedisKeys.pushHeld(userId, releaseAt.getTime());
    await this.redis.incrby(counterKey, count);
    await this.redis.expire(counterKey, COUNTER_TTL_SECONDS);
    await upsertJob<PushBundleJob>(
      this.queue,
      JOB.PUSH_BUNDLE,
      { userId, counterKey },
      { jobId: JobId.pushBundle(userId, releaseAt.getTime()), delay: Math.max(0, releaseAt.getTime() - Date.now()) },
      'keep',
    );
  }

  /** Worker: a critical push held by quiet hours / focus mode (skipped if the user already saw it). */
  async deliverHeld(job: HeldPushJob): Promise<'sent' | 'skipped' | 'held'> {
    if (job.notificationId) {
      const row = await this.prisma.notification.findUnique({
        where: { id: job.notificationId },
        select: { readAt: true },
      });
      if (!row || row.readAt) return 'skipped';
    }
    const user = await this.users.findById(job.userId);
    if (!user || user.status !== 'active') return 'skipped';
    const prefs = await this.users.getSettings(job.userId);
    if (!prefs.pushNotifications) return 'skipped';
    const tz = safeTimeZone(user.timezone);
    const decision = decidePush({
      priority: 'critical',
      type: job.type as NotificationType,
      now: new Date(),
      timezone: tz,
      settings: prefs,
      sentToday: 0,
    });
    const payload = { title: job.title, body: job.body, categoryId: job.categoryId, data: job.data };
    if (decision.action === 'hold') {
      // Focus mode was extended meanwhile.
      await this.holdPush(job.userId, job.notificationId, job.type as NotificationType, payload, decision.until);
      return 'held';
    }
    const sent = await this.sendPush(job.userId, payload);
    if (sent) await this.afterPush(job.userId, tz, false);
    return sent ? 'sent' : 'skipped';
  }

  /** Worker: one push for everything held back by quiet hours or the daily budget. */
  async deliverBundle(job: PushBundleJob): Promise<'sent' | 'skipped' | 'held'> {
    const count = Number(await this.redis.getdel(job.counterKey)) || 0;
    if (!count) return 'skipped';
    const user = await this.users.findById(job.userId);
    if (!user || user.status !== 'active') return 'skipped';
    const prefs = await this.users.getSettings(job.userId);
    const tz = safeTimeZone(user.timezone);
    const decision = decidePush({
      priority: 'normal',
      type: 'push_bundle',
      now: new Date(),
      timezone: tz,
      settings: prefs,
      sentToday: 0,
    });
    if (decision.action === 'bundle') {
      await this.addToBundle(job.userId, decision.releaseAt, count);
      return 'held';
    }
    const vars = {
      title: count === 1 ? '1 new update' : `${count} new updates`,
      body: 'Tap to catch up on what you missed.',
    };
    const res = await this.deliver({
      userId: job.userId,
      type: 'push_bundle',
      templateKey: 'push_bundle',
      vars,
      fallback: vars,
      channels: ['push'],
      data: { url: '/notifications' },
      skipPolicy: true,
    });
    return res.delivered.includes('push') ? 'sent' : 'skipped';
  }
}
