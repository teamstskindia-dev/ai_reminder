import { Injectable, Logger } from '@nestjs/common';
import { UpstreamError, causeChain } from '../../common/errors/app.exception';
import type { AppNotification, NotificationType, ReminderChannel } from '../../common/types/api.types';
import { escapeHtml, renderTemplate, TemplateVars } from '../../common/utils/template.util';
import { MailService } from '../../infra/mail/mail.service';
import { Prisma } from '../../infra/prisma/models';
import { PushService } from '../../infra/push/push.service';
import { RealtimeEmitter } from '../../infra/realtime/realtime-emitter.service';
import { SettingsService } from '../content/settings.service';
import { DevicesRepository } from '../devices/devices.repository';
import { normalizeChannels } from '../reminders/reminders.mapper';
import { UsersRepository } from '../users/users.repository';
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
}

export interface DeliveryResult {
  notification: AppNotification | null;
  delivered: ReminderChannel[];
  skipped: boolean;
}

/**
 * Renders a notification template and fans it out to in-app (row + socket), push (Expo) and email
 * (SMTP), honouring global switches, feature flags and the user's preferences. Template variables are
 * HTML-escaped for email; push/email failures never block in-app delivery.
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

    const delivered: ReminderChannel[] = [];
    const failures: unknown[] = [];
    let notification: AppNotification | null = null;

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
      try {
        const tokens = await this.devices.tokensForUser(input.userId);
        if (tokens.length) {
          const res = await this.push.send(tokens, {
            title,
            body: body ?? '',
            data: {
              ...(input.data ?? {}),
              type: input.type,
              ...(notification ? { notificationId: notification.id } : {}),
            },
          });
          if (res.invalidTokens.length) await this.devices.deleteTokens(res.invalidTokens);
          if (res.sent > 0) delivered.push('push');
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
      { type: input.type, templateKey: input.templateKey, requested: channels, delivered, failed: failures.length },
      'notification delivered',
    );
    // Nothing went out and something failed → let the job retry (no in-app row was written in that case).
    if (!delivered.length && failures.length)
      throw failures[0] instanceof UpstreamError ? failures[0] : new UpstreamError('expo', undefined, failures[0]);
    return { notification, delivered, skipped: false };
  }
}
