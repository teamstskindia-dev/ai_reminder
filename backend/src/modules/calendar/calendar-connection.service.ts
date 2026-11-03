import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AppConfig } from '../../config/app-config';
import { securityLog } from '../../common/logging/security-log';
import { decryptString } from '../../common/utils/crypto.util';
import { GoogleOAuthService } from '../../infra/google/google-oauth.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { removeJob } from '../../infra/queue/job-utils';
import { JobId, QUEUE } from '../../infra/queue/queue.constants';
import { NotificationProducer } from '../notifications/notification-producer.service';
import { RemindersService } from '../reminders/reminders.service';
import { GoogleAccountsRepository } from '../users/users.repository';

export const GRANT_REVOKED_REASON = 'Google access was revoked. Reconnect your calendar to resume syncing.';

/** Disconnects Google Calendar: revokes/clears tokens, stops sync and cancels scheduled bots. */
@Injectable()
export class CalendarConnectionService {
  private readonly logger = new Logger(CalendarConnectionService.name);

  constructor(
    private readonly accounts: GoogleAccountsRepository,
    private readonly google: GoogleOAuthService,
    private readonly prisma: PrismaService,
    private readonly reminders: RemindersService,
    private readonly notifications: NotificationProducer,
    private readonly config: AppConfig,
    @InjectQueue(QUEUE.MEETING_BOT) private readonly botQueue: Queue,
    @InjectQueue(QUEUE.CALENDAR_SYNC) private readonly syncQueue: Queue,
  ) {}

  async disconnect(userId: string, opts: { revokeAtGoogle: boolean; syncError: string | null }): Promise<void> {
    const account = await this.accounts.find(userId);
    if (account?.refreshTokenEnc && opts.revokeAtGoogle) {
      try {
        await this.google.revoke(decryptString(account.refreshTokenEnc, this.config.encryptionKey));
      } catch {
        this.logger.warn({ userId }, 'could not decrypt Google token for revocation');
      }
    }
    if (account) {
      await this.accounts.update(userId, {
        accessTokenEnc: null,
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        calendarConnected: false,
        calendarSyncToken: null,
        syncError: opts.syncError,
      });
    }
    await removeJob(this.syncQueue, JobId.sync(userId));
    await this.cancelScheduledBots(userId);
  }

  /** `invalid_grant`: the user revoked access at Google (or the grant expired). */
  async handleRevokedGrant(userId: string): Promise<void> {
    securityLog('google_grant_revoked', { userId });
    await this.disconnect(userId, { revokeAtGoogle: false, syncError: GRANT_REVOKED_REASON });
    await this.notifications.notify({
      userId,
      type: 'reminder',
      templateKey: 'reminder',
      vars: { title: 'Reconnect Google Calendar', body: GRANT_REVOKED_REASON },
      data: { url: '/settings' },
      channels: ['in_app', 'push'],
    });
  }

  private async cancelScheduledBots(userId: string): Promise<void> {
    const meetings = await this.prisma.meeting.findMany({
      where: { userId, source: 'calendar', status: { in: ['scheduled', 'skipped'] }, startAt: { gte: new Date() } },
      select: { id: true },
    });
    for (const m of meetings) await removeJob(this.botQueue, JobId.bot(m.id));
    if (meetings.length) {
      await this.prisma.meeting.updateMany({
        where: { id: { in: meetings.map((m) => m.id) } },
        data: { botJobId: null },
      });
      const upcoming = await this.prisma.reminder.findMany({
        where: { meetingId: { in: meetings.map((m) => m.id) }, type: 'meeting_upcoming', status: 'pending' },
        select: { id: true },
      });
      await this.reminders.cancelMany(upcoming);
    }
  }
}
