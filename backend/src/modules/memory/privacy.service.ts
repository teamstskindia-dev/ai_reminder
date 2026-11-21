import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import type { DataExportStatus } from '../../common/types/api.types';
import { randomToken } from '../../common/utils/crypto.util';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { addJob } from '../../infra/queue/job-utils';
import { DataExportJob, JOB, JobId, QUEUE } from '../../infra/queue/queue.constants';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';
import { StorageService } from '../../infra/storage/storage.service';
import { SettingsService } from '../content/settings.service';
import { NotificationProducer } from '../notifications/notification-producer.service';

/** The download link works this long. */
const LINK_TTL_SECONDS = 3 * 86_400;
/** A new export can be asked for once the last one is this old (or failed). */
const COOLDOWN_MS = 10 * 60_000;
/** A "preparing" export older than this is treated as failed (the worker died mid-way). */
const STALE_MS = 30 * 60_000;
export const EXPORT_TOKEN_RE = /^[A-Za-z0-9_-]{24,100}$/;

interface StoredStatus {
  status: 'preparing' | 'ready';
  requestedAt: string;
  token?: string;
  path?: string;
  expiresAt?: string;
}

/**
 * Privacy (user-flow §10): export everything the friend remembers. The export is built by the worker as one
 * JSON file (no tokens or secrets), kept for 3 days, and the link is emailed ("Data export ready") and shown in
 * the app. The link carries a long random token; nothing else identifies the file.
 */
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationProducer,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(QUEUE.COMPANION) private readonly queue: Queue,
  ) {}

  private downloadUrl(token: string): string {
    return `${this.config.urls.api}/api/v1/exports/${token}`;
  }

  private async stored(userId: string): Promise<StoredStatus | null> {
    const raw = await this.redis.get(RedisKeys.dataExport(userId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredStatus;
    } catch {
      return null;
    }
  }

  async status(userId: string): Promise<DataExportStatus> {
    const s = await this.stored(userId);
    if (!s || (s.status === 'preparing' && Date.now() - new Date(s.requestedAt).getTime() > STALE_MS)) {
      return { status: 'none', url: null, requestedAt: null, expiresAt: null };
    }
    return {
      status: s.status,
      url: s.status === 'ready' && s.token ? this.downloadUrl(s.token) : null,
      requestedAt: s.requestedAt,
      expiresAt: s.expiresAt ?? null,
    };
  }

  async request(userId: string): Promise<DataExportStatus> {
    if (!this.storage.configured) throw AppException.conflict('Data export is not available right now.');
    const current = await this.stored(userId);
    const age = current ? Date.now() - new Date(current.requestedAt).getTime() : Infinity;
    if (current?.status === 'preparing' && age < STALE_MS) return this.status(userId);
    if (current?.status === 'ready' && age < COOLDOWN_MS) return this.status(userId);
    const requestedAt = new Date();
    const next: StoredStatus = { ...(current ?? {}), status: 'preparing', requestedAt: requestedAt.toISOString() };
    await this.redis.set(RedisKeys.dataExport(userId), JSON.stringify(next), 'EX', LINK_TTL_SECONDS);
    await addJob<DataExportJob>(
      this.queue,
      JOB.DATA_EXPORT,
      { userId },
      {
        jobId: JobId.dataExport(userId, requestedAt.getTime()),
        attempts: 2,
      },
    );
    return this.status(userId);
  }

  /** Worker: builds the export, stores it, and tells the user (email + in-app). */
  async build(userId: string): Promise<{ bytes: number } | null> {
    const data = await this.collect(userId);
    if (!data) return null;
    const previous = await this.stored(userId);
    const token = randomToken(32);
    const path = `exports/${userId}/${token}.json`;
    const body = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
    await this.storage.upload(path, body, 'application/json');
    if (previous?.path && previous.path !== path) await this.storage.remove([previous.path]).catch(() => undefined);
    if (previous?.token) await this.redis.del(RedisKeys.dataExportToken(previous.token));

    const expiresAt = new Date(Date.now() + LINK_TTL_SECONDS * 1000);
    const status: StoredStatus = {
      status: 'ready',
      requestedAt: previous?.requestedAt ?? new Date().toISOString(),
      token,
      path,
      expiresAt: expiresAt.toISOString(),
    };
    await this.redis.set(RedisKeys.dataExportToken(token), JSON.stringify({ userId, path }), 'EX', LINK_TTL_SECONDS);
    await this.redis.set(RedisKeys.dataExport(userId), JSON.stringify(status), 'EX', LINK_TTL_SECONDS);

    const branding = await this.settings.get('branding');
    const profile = await this.prisma.userProfile.findUnique({ where: { userId }, select: { preferredName: true } });
    await this.notifications.notify({
      userId,
      type: 'data_export_ready',
      templateKey: 'data_export_ready',
      vars: {
        name: profile?.preferredName ?? data.account.name?.split(' ')[0] ?? 'there',
        appName: branding.appName,
        url: this.downloadUrl(token),
      },
      data: { url: '/profile', downloadUrl: this.downloadUrl(token) },
    });
    this.logger.log({ userId, bytes: body.length }, 'data export ready');
    return { bytes: body.length };
  }

  /** Public download by token: the file and a friendly name. */
  async download(token: string): Promise<{ body: Buffer; filename: string }> {
    if (!EXPORT_TOKEN_RE.test(token)) throw AppException.notFound('Export');
    const raw = await this.redis.get(RedisKeys.dataExportToken(token));
    if (!raw) throw AppException.notFound('Export');
    const { path } = JSON.parse(raw) as { userId: string; path: string };
    const blob = await this.storage.download(path);
    const body = Buffer.from(await blob.arrayBuffer());
    return { body, filename: `my-data-${new Date().toISOString().slice(0, 10)}.json` };
  }

  /** Everything the user owns, without tokens, secrets or internal ids of other systems. */
  private async collect(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true,
        locale: true,
        createdAt: true,
        onboardedAt: true,
        settings: true,
        profile: true,
      },
    });
    if (!user) return null;
    const [
      meetings,
      actionItems,
      reminders,
      checkins,
      nudges,
      recaps,
      people,
      emails,
      toolTasks,
      threads,
      apps,
      notifications,
    ] = await Promise.all([
      this.prisma.meeting.findMany({
        where: { userId },
        orderBy: { startAt: 'desc' },
        select: {
          id: true,
          source: true,
          title: true,
          description: true,
          platform: true,
          startAt: true,
          endAt: true,
          status: true,
          durationSeconds: true,
          attendees: true,
          bookmarks: true,
          report: {
            select: {
              summary: true,
              keyPoints: true,
              chapters: true,
              keyQuestions: true,
              decisions: true,
              topics: true,
              sentimentLabel: true,
              insights: true,
              createdAt: true,
            },
          },
          participants: { select: { name: true, email: true, talkTimeSeconds: true, wordCount: true } },
          segments: { orderBy: { seq: 'asc' }, select: { speaker: true, text: true, startMs: true, endMs: true } },
        },
      }),
      this.prisma.actionItem.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          meetingId: true,
          title: true,
          description: true,
          assigneeName: true,
          isMine: true,
          dueAt: true,
          priority: true,
          status: true,
          source: true,
          completedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.reminder.findMany({
        where: { userId },
        orderBy: { remindAt: 'desc' },
        select: {
          id: true,
          meetingId: true,
          actionItemId: true,
          type: true,
          title: true,
          body: true,
          remindAt: true,
          status: true,
          source: true,
          doneAt: true,
          createdAt: true,
        },
      }),
      this.prisma.dailyCheckin.findMany({
        where: { userId },
        orderBy: { localDate: 'desc' },
        select: { localDate: true, status: true, messages: true, mood: true, energy: true, wins: true, summary: true },
      }),
      this.prisma.companionNudge.findMany({
        where: { userId },
        orderBy: { sendAt: 'desc' },
        select: { localDate: true, text: true, reason: true, status: true, messages: true, sentAt: true },
      }),
      this.prisma.weeklyRecap.findMany({
        where: { userId },
        orderBy: { weekStart: 'desc' },
        select: { weekStart: true, data: true },
      }),
      this.prisma.person.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
        select: { name: true, relationship: true, facts: true, aliases: true, lastTalkedAt: true, meetingIds: true },
      }),
      this.prisma.emailMessage.findMany({
        where: { userId },
        orderBy: { receivedAt: 'desc' },
        select: {
          fromName: true,
          fromEmail: true,
          subject: true,
          summary: true,
          why: true,
          category: true,
          status: true,
          detected: true,
          receivedAt: true,
        },
      }),
      this.prisma.toolTask.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          provider: true,
          externalKey: true,
          url: true,
          title: true,
          details: true,
          ownerName: true,
          status: true,
          source: true,
          dueAt: true,
          createdAt: true,
        },
      }),
      this.prisma.assistantThread.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          title: true,
          createdAt: true,
          messages: { orderBy: { createdAt: 'asc' }, select: { role: true, content: true, createdAt: true } },
        },
      }),
      this.prisma.connectedAccount.findMany({
        where: { userId },
        select: { provider: true, accountLabel: true, status: true, createdAt: true, lastSyncedAt: true },
      }),
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { type: true, title: true, body: true, readAt: true, createdAt: true },
      }),
    ]);
    const { settings, profile, ...account } = user;
    const cleanSettings = settings ? { ...settings, userId: undefined } : null;
    const cleanProfile = profile ? { ...profile, userId: undefined } : null;
    return {
      exportedAt: new Date().toISOString(),
      account,
      settings: cleanSettings,
      whatIKnowAboutYou: cleanProfile,
      people,
      conversations: meetings,
      todos: actionItems,
      reminders,
      checkins,
      nudges,
      weeklyRecaps: recaps,
      emails,
      toolTasks,
      talk: threads,
      connectedApps: apps,
      notifications,
    };
  }
}
