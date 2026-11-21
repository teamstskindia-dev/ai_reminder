import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { causeChain } from '../../common/errors/app.exception';
import { decryptString } from '../../common/utils/crypto.util';
import { escapeHtml, renderTemplate } from '../../common/utils/template.util';
import { MailService } from '../../infra/mail/mail.service';
import { GoogleOAuthService } from '../../infra/google/google-oauth.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { removeJob } from '../../infra/queue/job-utils';
import { JobId, QUEUE } from '../../infra/queue/queue.constants';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';
import { StorageService } from '../../infra/storage/storage.service';
import { AuthSessionsRepository } from '../auth/auth-sessions.repository';
import { SettingsService } from '../content/settings.service';
import { GoogleAccountsRepository, UsersRepository } from './users.repository';

/** Deletes a user and everything they own (DB cascade), plus queued jobs, stored files and Google grants. */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly google: GoogleAccountsRepository,
    private readonly sessions: AuthSessionsRepository,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(QUEUE.MEETING_BOT) private readonly botQueue: Queue,
    @InjectQueue(QUEUE.NOTIFICATIONS) private readonly notificationsQueue: Queue,
    @InjectQueue(QUEUE.CALENDAR_SYNC) private readonly syncQueue: Queue,
    @InjectQueue(QUEUE.AI) private readonly aiQueue: Queue,
  ) {}

  async deleteUser(userId: string): Promise<void> {
    const user = await this.users.getById(userId);
    const profile = await this.prisma.userProfile.findUnique({ where: { userId }, select: { preferredName: true } });

    const account = await this.google.find(userId);
    if (account?.refreshTokenEnc) {
      try {
        await this.googleOAuth.revoke(decryptString(account.refreshTokenEnc, this.config.encryptionKey));
      } catch (err) {
        this.logger.warn(`Could not decrypt Google token for revoke: ${(err as Error).message}`);
      }
    }

    const meetings = await this.prisma.meeting.findMany({
      where: { userId },
      select: { id: true, status: true, recordingPath: true },
    });
    for (const m of meetings) {
      await removeJob(this.botQueue, JobId.bot(m.id));
      await removeJob(this.aiQueue, JobId.ai(m.id));
      if (['joining', 'waiting_room', 'in_progress'].includes(m.status)) {
        await this.redis.set(RedisKeys.botLeave(m.id), '1', 'EX', 6 * 3600);
      }
    }
    const reminders = await this.prisma.reminder.findMany({
      where: { userId, status: 'pending' },
      select: { id: true },
    });
    for (const r of reminders) await removeJob(this.notificationsQueue, JobId.reminder(r.id));
    await removeJob(this.syncQueue, JobId.sync(userId));

    // A data export waiting to be downloaded goes too (user-flow §10).
    const exportPaths: string[] = [];
    const pending = await this.redis.get(RedisKeys.dataExport(userId)).catch(() => null);
    if (pending) {
      try {
        const s = JSON.parse(pending) as { path?: string; token?: string };
        if (s.path) exportPaths.push(s.path);
        if (s.token) await this.redis.del(RedisKeys.dataExportToken(s.token));
      } catch {
        // unreadable status: nothing to clean
      }
      await this.redis.del(RedisKeys.dataExport(userId));
    }
    await this.storage.remove([
      ...meetings.map((m) => m.recordingPath).filter((p): p is string => !!p),
      ...exportPaths,
    ]);
    await this.sessions.revokeAllForSubject('user', userId, new Date());
    await this.users.delete(userId);
    this.logger.log(`Deleted user ${userId}`);
    await this.sendGoodbye(user.email, profile?.preferredName ?? user.name?.split(' ')[0] ?? null);
  }

  /** "Account deleted, data erased" (user-flow §10), sent after the data is gone (never blocks deletion). */
  private async sendGoodbye(email: string, name: string | null): Promise<void> {
    try {
      if (!this.mail.configured) return;
      const [template, notif, branding] = await Promise.all([
        this.prisma.notificationTemplate.findUnique({ where: { key: 'account_deleted' } }),
        this.settings.get('notifications'),
        this.settings.get('branding'),
      ]);
      if (!template?.isActive || !notif.emailEnabled) return;
      const vars = { name: name ?? 'there', appName: branding.appName };
      const body = template.emailBody ?? template.bodyTemplate;
      await this.mail.send({
        to: email,
        subject: renderTemplate(template.emailSubject ?? template.titleTemplate, vars),
        markdown: renderTemplate(body, vars, escapeHtml),
        text: renderTemplate(body, vars),
        fromName: notif.fromName,
        fromEmail: notif.fromEmail,
      });
    } catch (err) {
      this.logger.warn({ causes: causeChain(err) }, 'account deleted email failed');
    }
  }
}
