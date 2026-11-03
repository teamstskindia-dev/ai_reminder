import type { Reminder, ReminderChannel } from '../../common/types/api.types';
import { REMINDER_CHANNELS } from '../../common/types/api.types';
import { Prisma } from '../../infra/prisma/models';

export const REMINDER_INCLUDE = { meeting: { select: { title: true } } } satisfies Prisma.ReminderInclude;

export type ReminderWithMeeting = Prisma.ReminderGetPayload<{ include: typeof REMINDER_INCLUDE }>;

export function normalizeChannels(channels: unknown): ReminderChannel[] {
  if (!Array.isArray(channels)) return [];
  return channels.filter((c): c is ReminderChannel => (REMINDER_CHANNELS as readonly string[]).includes(c as string));
}

export function toReminder(row: ReminderWithMeeting): Reminder {
  return {
    id: row.id,
    type: row.type as Reminder['type'],
    title: row.title,
    body: row.body,
    remindAt: row.remindAt.toISOString(),
    channels: normalizeChannels(row.channels),
    status: row.status as Reminder['status'],
    source: row.source as Reminder['source'],
    meetingId: row.meetingId,
    meetingTitle: row.meeting?.title ?? null,
    actionItemId: row.actionItemId,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
