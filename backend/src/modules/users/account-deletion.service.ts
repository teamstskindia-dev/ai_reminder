import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { decryptString } from '../../common/utils/crypto.util';
import { GoogleOAuthService } from '../../infra/google/google-oauth.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { removeJob } from '../../infra/queue/job-utils';
import { JobId, QUEUE } from '../../infra/queue/queue.constants';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';
import { StorageService } from '../../infra/storage/storage.service';
import { AuthSessionsRepository } from '../auth/auth-sessions.repository';
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
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(QUEUE.MEETING_BOT) private readonly botQueue: Queue,
    @InjectQueue(QUEUE.NOTIFICATIONS) private readonly notificationsQueue: Queue,
    @InjectQueue(QUEUE.CALENDAR_SYNC) private readonly syncQueue: Queue,
    @InjectQueue(QUEUE.AI) private readonly aiQueue: Queue,
  ) {}

  async deleteUser(userId: string): Promise<void> {
    await this.users.getById(userId);

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

    await this.storage.remove(meetings.map((m) => m.recordingPath).filter((p): p is string => !!p));
    await this.sessions.revokeAllForSubject('user', userId, new Date());
    await this.users.delete(userId);
    this.logger.log(`Deleted user ${userId}`);
  }
}
