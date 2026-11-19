import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DeliveryService } from '../notifications/delivery.service';
import { nudgesPaused } from '../notifications/notification-policy';
import { inQuietHours, localMinutes } from './rhythm.util';

/** Statuses in which nobody has recorded the meeting yet (the bot records into the meeting itself). */
const NOT_RECORDED = ['scheduled', 'skipped'];

/**
 * The two calendar nudges around a meeting (user-flow §06): "Meeting starting: record it?" at the start,
 * and "Add quick notes?" right after it ends when nothing was recorded. Both open the recorder linked to
 * the event. Everything is re-checked when the job runs (cancelled, moved, bot joining, already recorded).
 */
@Injectable()
export class MeetingPromptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryService,
  ) {}

  private async load(meetingId: string) {
    return this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        userId: true,
        title: true,
        status: true,
        startAt: true,
        endAt: true,
        botJobId: true,
        _count: { select: { recordings: true } },
        user: {
          select: {
            status: true,
            timezone: true,
            settings: { select: { quietHoursStart: true, quietHoursEnd: true, nudgesPausedUntil: true } },
          },
        },
      },
    });
  }

  async start(meetingId: string, at: string): Promise<'sent' | 'skipped'> {
    const m = await this.load(meetingId);
    if (!m || m.user.status !== 'active' || !NOT_RECORDED.includes(m.status)) return 'skipped';
    if (Math.abs(m.startAt.getTime() - new Date(at).getTime()) > 1000) return 'skipped'; // moved since
    if (m.botJobId || m._count.recordings) return 'skipped'; // the notetaker joins, or already recording
    const url = `/capture/record?meetingId=${m.id}`;
    await this.delivery.deliver({
      userId: m.userId,
      type: 'meeting_start',
      templateKey: 'meeting_start',
      vars: { meetingTitle: m.title },
      fallback: { title: `${m.title} is starting`, body: 'Tap to record it.' },
      data: { url, eventId: m.id },
    });
    return 'sent';
  }

  async notes(meetingId: string, at: string): Promise<'sent' | 'skipped'> {
    const m = await this.load(meetingId);
    if (!m || m.user.status !== 'active' || !NOT_RECORDED.includes(m.status)) return 'skipped';
    const end = (m.endAt ?? new Date(m.startAt.getTime() + 60 * 60_000)).getTime() + 2 * 60_000;
    if (Math.abs(end - new Date(at).getTime()) > 1000) return 'skipped';
    if (m._count.recordings) return 'skipped';
    const s = m.user.settings;
    if (s && inQuietHours(localMinutes(new Date(), m.user.timezone), s.quietHoursStart, s.quietHoursEnd)) {
      return 'skipped';
    }
    if (s && nudgesPaused(s)) return 'skipped';
    await this.delivery.deliver({
      userId: m.userId,
      type: 'meeting_notes',
      templateKey: 'meeting_notes',
      vars: { meetingTitle: m.title },
      fallback: { title: `How did ${m.title} go?`, body: 'Add quick notes: speak for 30 seconds.' },
      data: { url: `/capture/record?meetingId=${m.id}&mode=notes`, eventId: m.id },
    });
    return 'sent';
  }
}
