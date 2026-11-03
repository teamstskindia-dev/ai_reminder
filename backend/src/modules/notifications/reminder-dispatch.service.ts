import { Injectable, Logger } from '@nestjs/common';
import type { NotificationType } from '../../common/types/api.types';
import { formatTime, relativeDue } from '../../common/utils/time.util';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RealtimeEmitter } from '../../infra/realtime/realtime-emitter.service';
import { SettingsService } from '../content/settings.service';
import { normalizeChannels, toReminder } from '../reminders/reminders.mapper';
import { RemindersRepository } from '../reminders/reminders.repository';
import { DeliveryService } from './delivery.service';

export type ReminderOutcome = 'sent' | 'skipped';

/** Fires one reminder: re-reads the row (source of truth), renders the template and delivers it. */
@Injectable()
export class ReminderDispatchService {
  private readonly logger = new Logger(ReminderDispatchService.name);

  constructor(
    private readonly reminders: RemindersRepository,
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryService,
    private readonly settings: SettingsService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async dispatch(reminderId: string, scheduledFor: string): Promise<ReminderOutcome> {
    const reminder = await this.reminders.findById(reminderId);
    if (!reminder || reminder.status !== 'pending') {
      this.logger.log({ reminderId, status: reminder?.status ?? 'deleted' }, 'reminder no longer pending; skipped');
      return 'skipped';
    }
    if (Math.abs(reminder.remindAt.getTime() - new Date(scheduledFor).getTime()) > 1000) {
      this.logger.log({ reminderId }, 'reminder was rescheduled; stale job skipped');
      return 'skipped';
    }
    const user = await this.prisma.user.findUnique({
      where: { id: reminder.userId },
      select: { timezone: true, settings: { select: { botName: true } } },
    });
    if (!user) return 'skipped';
    const tz = user.timezone;
    const now = new Date();

    let type: NotificationType = 'reminder';
    let templateKey = 'reminder';
    let vars: Record<string, string | number | null> = { title: reminder.title, body: reminder.body ?? '' };

    if (reminder.type === 'meeting_upcoming') {
      const meeting = reminder.meetingId
        ? await this.prisma.meeting.findUnique({ where: { id: reminder.meetingId } })
        : null;
      if (!meeting || ['cancelled', 'completed', 'failed', 'processing'].includes(meeting.status)) {
        await this.reminders.update(reminder.id, { status: 'cancelled' });
        return 'skipped';
      }
      const bot = await this.settings.get('bot');
      type = 'meeting_upcoming';
      templateKey = 'meeting_upcoming';
      vars = {
        meetingTitle: meeting.title,
        minutes: Math.max(0, Math.round((meeting.startAt.getTime() - now.getTime()) / 60_000)),
        botName: user.settings?.botName ?? bot.botName,
        startTime: formatTime(meeting.startAt, tz),
      };
    } else if (reminder.type === 'action_item_due') {
      const item = reminder.actionItemId
        ? await this.prisma.actionItem.findUnique({
            where: { id: reminder.actionItemId },
            include: { meeting: { select: { title: true } } },
          })
        : null;
      if (item && item.status !== 'open') {
        await this.reminders.update(reminder.id, { status: 'cancelled' });
        return 'skipped';
      }
      type = 'action_item_due';
      templateKey = 'action_item_due';
      vars = {
        title: item?.title ?? reminder.title,
        meetingTitle: item?.meeting?.title ?? reminder.meeting?.title ?? '',
        dueRelative: relativeDue(item?.dueAt ?? reminder.remindAt, now, tz),
      };
    }

    await this.delivery.deliver({
      userId: reminder.userId,
      type,
      templateKey,
      vars,
      // System reminders follow the admin-managed template channels; user/AI reminders their own.
      channels: reminder.source === 'system' ? undefined : normalizeChannels(reminder.channels),
      fallback: { title: reminder.title, body: reminder.body },
      data: {
        reminderId: reminder.id,
        ...(reminder.meetingId ? { meetingId: reminder.meetingId } : {}),
        ...(reminder.actionItemId ? { actionItemId: reminder.actionItemId } : {}),
      },
    });
    const sent = await this.reminders.update(reminder.id, { status: 'sent', sentAt: new Date(), failureReason: null });
    this.realtime.toUser(reminder.userId, 'reminder:fired', toReminder(sent));
    return 'sent';
  }

  /** After the last retry: record the failure on the row (source of truth). */
  async markFailed(reminderId: string, reason: string): Promise<void> {
    const reminder = await this.reminders.findById(reminderId);
    if (!reminder || reminder.status !== 'pending') return;
    await this.reminders.update(reminderId, { status: 'failed', failureReason: reason.slice(0, 300) });
  }
}
