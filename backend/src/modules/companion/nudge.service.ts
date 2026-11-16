import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import type { CompanionNudge, NudgeReply, NudgeStatus } from '../../common/types/api.types';
import { formatLongDate } from '../../common/utils/time.util';
import type { CompanionNudgeRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { removeJob, upsertJob } from '../../infra/queue/job-utils';
import { JOB, JobId, NudgeJob, QUEUE } from '../../infra/queue/queue.constants';
import { DeliveryService } from '../notifications/delivery.service';
import { chatLanguage, toMessages } from './checkin.service';
import { CompanionChatService } from './companion-chat.service';
import { CompanionContextService, type CompanionUser } from './companion-context.service';
import { checkinFallback, nudgePush } from './companion.copy';
import { atLocalTime, dateOnly, dayKey, inQuietHours, localMinutes, toMinutes } from './rhythm.util';

const MAX_NUDGE_MESSAGES = 20;
const DEFAULT_NUDGE_TIME = '11:00';
/** Keep nudges away from the evening check-in so the friend never double-pings. */
const CHECKIN_GAP_MINUTES = 60;

export function toNudge(row: CompanionNudgeRow): CompanionNudge {
  return {
    id: row.id,
    text: row.text,
    status: row.status as NudgeStatus,
    sentAt: row.sentAt?.toISOString() ?? null,
    messages: toMessages(row.messages),
  };
}

/**
 * Proactive friend nudges (user-flow §03): night learning may plan one specific follow-up for the day
 * ("How did the investor call go?"). At most one per local day, never in quiet hours, never close to
 * the evening check-in. Tapping it opens a short chat with the friend.
 */
@Injectable()
export class NudgeService {
  private readonly logger = new Logger(NudgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: CompanionContextService,
    private readonly chat: CompanionChatService,
    private readonly delivery: DeliveryService,
    @InjectQueue(QUEUE.COMPANION) private readonly queue: Queue,
  ) {}

  /** Plans the day's nudge at a sensible local time. Returns null when it would not be appropriate. */
  async schedule(
    user: CompanionUser,
    day: string,
    plan: { text: string; time: string | null; reason: string | null },
  ): Promise<CompanionNudge | null> {
    const sendAt = this.pickTime(user, day, plan.time);
    if (!sendAt) return null;
    let row: CompanionNudgeRow;
    try {
      row = await this.prisma.companionNudge.create({
        data: {
          userId: user.userId,
          localDate: dateOnly(day),
          text: plan.text.slice(0, 300),
          reason: plan.reason?.slice(0, 200) ?? null,
          sendAt,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null; // one per day
      throw err;
    }
    await upsertJob<NudgeJob>(
      this.queue,
      JOB.NUDGE,
      { nudgeId: row.id },
      {
        jobId: JobId.nudge(row.id),
        delay: Math.max(0, sendAt.getTime() - Date.now()),
      },
    );
    this.logger.log({ userId: user.userId, sendAt: sendAt.toISOString() }, 'nudge scheduled');
    return toNudge(row);
  }

  /** Worker: delivers a scheduled nudge (skipped if dismissed, or if quiet hours started meanwhile). */
  async dispatch(nudgeId: string): Promise<'sent' | 'skipped'> {
    const row = await this.prisma.companionNudge.findUnique({ where: { id: nudgeId } });
    if (!row || row.status !== 'scheduled') return 'skipped';
    const user = await this.context.user(row.userId);
    const s = user?.settings;
    if (!user || !s || inQuietHours(localMinutes(new Date(), user.timezone), s.quietHoursStart, s.quietHoursEnd)) {
      await this.prisma.companionNudge.update({ where: { id: row.id }, data: { status: 'cancelled' } });
      return 'skipped';
    }
    const push = nudgePush(user.lang, user.name, row.text);
    await this.delivery.deliver({
      userId: row.userId,
      type: 'companion_nudge',
      templateKey: 'companion_nudge',
      vars: push,
      fallback: push,
      data: { url: `/nudge/${row.id}`, nudgeId: row.id },
    });
    await this.prisma.companionNudge.update({
      where: { id: row.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        messages: [{ role: 'assistant', content: row.text, at: new Date().toISOString() }] as Prisma.InputJsonValue,
      },
    });
    return 'sent';
  }

  async get(userId: string, id: string): Promise<CompanionNudge> {
    return toNudge(await this.owned(userId, id));
  }

  /** Today's sent, not dismissed nudge (shown on Today). */
  async current(userId: string, timezone: string): Promise<CompanionNudge | null> {
    const row = await this.prisma.companionNudge.findUnique({
      where: { userId_localDate: { userId, localDate: dateOnly(dayKey(new Date(), timezone)) } },
    });
    return row && row.status === 'sent' ? toNudge(row) : null;
  }

  async reply(userId: string, id: string, text: string): Promise<NudgeReply> {
    const content = text.replace(/\s+/g, ' ').trim().slice(0, 1000);
    if (!content) throw AppException.validation([{ field: 'text', messages: ['text should not be empty'] }]);
    const row = await this.owned(userId, id);
    if (row.status === 'scheduled' || row.status === 'cancelled')
      throw AppException.conflict('This nudge was not sent');
    const user = await this.context.user(userId);
    if (!user) throw AppException.notFound('User');
    const now = new Date();
    const history = toMessages(row.messages);
    const messages = [
      ...(history.length ? history : [{ role: 'assistant' as const, content: row.text, at: now.toISOString() }]),
      { role: 'user' as const, content, at: now.toISOString() },
    ];
    const day = dayKey(now, user.timezone);
    const facts = await this.context.day(userId, user.timezone, day);
    const reply = await this.chat.reply({
      user,
      mode: 'nudge',
      history: messages,
      nudgeText: row.text,
      profile: this.context.profileText(user),
      dayContext: this.context.dayText(facts, user.timezone),
      today: formatLongDate(now, user.timezone),
      fallback: checkinFallback(chatLanguage(user.lang, messages), 2),
    });
    const all = [...messages, { role: 'assistant' as const, content: reply, at: new Date().toISOString() }].slice(
      -MAX_NUDGE_MESSAGES,
    );
    const updated = await this.prisma.companionNudge.update({
      where: { id },
      data: { messages: all as unknown as Prisma.InputJsonValue },
    });
    return { nudge: toNudge(updated), reply };
  }

  async dismiss(userId: string, id: string): Promise<void> {
    const row = await this.owned(userId, id);
    if (row.status === 'scheduled') await removeJob(this.queue, JobId.nudge(id));
    if (row.status === 'scheduled' || row.status === 'sent') {
      await this.prisma.companionNudge.update({ where: { id }, data: { status: 'dismissed' } });
    }
  }

  private async owned(userId: string, id: string): Promise<CompanionNudgeRow> {
    const row = await this.prisma.companionNudge.findFirst({ where: { id, userId } });
    if (!row) throw AppException.notFound('Nudge');
    return row;
  }

  /**
   * When to send: the suggested local time (default 11:00), at least 15 minutes from now. Returns null
   * (skip today) when that lands in quiet hours, on another day, or within an hour of the check-in.
   */
  private pickTime(user: CompanionUser, day: string, suggested: string | null): Date | null {
    const s = user.settings;
    const time = toMinutes(suggested) !== null ? (suggested as string) : DEFAULT_NUDGE_TIME;
    let at = atLocalTime(day, user.timezone, time);
    const soon = Date.now() + 15 * 60_000;
    if (at.getTime() < soon) at = new Date(soon);
    const minutes = localMinutes(at, user.timezone);
    if (dayKey(at, user.timezone) !== day) return null;
    if (inQuietHours(minutes, s.quietHoursStart, s.quietHoursEnd)) return null;
    const checkin = toMinutes(s.checkinTime);
    if (s.eveningCheckin && checkin !== null && minutes > checkin - CHECKIN_GAP_MINUTES) return null;
    return at;
  }
}
