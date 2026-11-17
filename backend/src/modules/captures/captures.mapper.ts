import type {
  CaptureBookmark,
  CaptureDetail,
  CaptureListItem,
  CaptureStatus,
  MeetingRef,
} from '../../common/types/api.types';
import { Prisma } from '../../infra/prisma/models';
import { NO_SPEECH_REASON } from '../ai/ai-pipeline.service';
import { toCaptureInsights, toFollowUp } from '../ai/capture-insights.service';
import { toRecordingParts } from '../ai/transcription.service';
import { summaryPreview, toActionItem } from '../meetings/meetings.mapper';
import { REMINDER_INCLUDE, toReminder } from '../reminders/reminders.mapper';

/** Reminders shown on a capture: everything still relevant (not cancelled or failed). */
const VISIBLE_REMINDER_STATUSES = ['pending', 'sent', 'done'];

export const CAPTURE_LIST_INCLUDE = {
  report: { select: { summary: true, insights: true } },
  _count: {
    select: {
      actionItems: true,
      reminders: { where: { status: { in: VISIBLE_REMINDER_STATUSES } } },
    },
  },
} satisfies Prisma.MeetingInclude;

export const CAPTURE_DETAIL_INCLUDE = {
  report: true,
  linkedMeeting: { select: { id: true, title: true, startAt: true, endAt: true } },
  actionItems: { orderBy: { createdAt: 'asc' } },
  reminders: {
    where: { status: { in: VISIBLE_REMINDER_STATUSES } },
    orderBy: { remindAt: 'asc' },
    include: REMINDER_INCLUDE,
  },
} satisfies Prisma.MeetingInclude;

export type CaptureListRow = Prisma.MeetingGetPayload<{ include: typeof CAPTURE_LIST_INCLUDE }>;
export type CaptureDetailRow = Prisma.MeetingGetPayload<{ include: typeof CAPTURE_DETAIL_INCLUDE }>;

/** Meeting status → capture status (a capture never sits in the bot/calendar statuses). */
export function toCaptureStatus(status: string): CaptureStatus {
  if (status === 'uploading' || status === 'processing' || status === 'completed') return status;
  return 'failed';
}

export function toBookmarks(raw: unknown): CaptureBookmark[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (b: unknown): b is Record<string, unknown> =>
        !!b && typeof b === 'object' && typeof (b as Record<string, unknown>).atMs === 'number',
    )
    .map((b) => ({ atMs: b.atMs as number, label: typeof b.label === 'string' && b.label ? b.label : null }))
    .sort((a, b) => a.atMs - b.atMs);
}

type BaseRow = CaptureListRow | CaptureDetailRow;

function base(row: BaseRow, actionItemCount: number, reminderCount: number): CaptureListItem {
  const insights = toCaptureInsights(row.report?.insights);
  return {
    id: row.id,
    title: row.title,
    status: toCaptureStatus(row.status),
    startAt: row.startAt.toISOString(),
    durationSeconds: row.durationSeconds,
    summaryPreview: row.report?.summary ? summaryPreview(row.report.summary, 160) : null,
    actionItemCount,
    reminderCount,
    openSuggestionCount: insights?.suggestions.filter((s) => s.status === 'open').length ?? 0,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    failureReason: row.status === 'failed' ? row.failureReason : null,
    noSpeech: row.status === 'failed' && row.failureReason === NO_SPEECH_REASON,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCaptureListItem(row: CaptureListRow): CaptureListItem {
  return base(row, row._count.actionItems, row._count.reminders);
}

type EventRow = { id: string; title: string; startAt: Date; endAt: Date | null };

export function toMeetingRef(m: EventRow): MeetingRef {
  return { id: m.id, title: m.title, startAt: m.startAt.toISOString(), endAt: m.endAt?.toISOString() ?? null };
}

export function toCaptureDetail(row: CaptureDetailRow, eventSuggestions: EventRow[] = []): CaptureDetail {
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const parts = toRecordingParts(row.recordingParts);
  return {
    ...base(row, row.actionItems.length, row.reminders.length),
    summary: row.report?.summary ?? null,
    keyPoints: arr<string>(row.report?.keyPoints),
    decisions: arr<string>(row.report?.decisions),
    bookmarks: toBookmarks(row.bookmarks),
    actionItems: row.actionItems.map((i) => toActionItem(i, row.title)),
    reminders: row.reminders.map(toReminder),
    insights: toCaptureInsights(row.report?.insights),
    partsUploaded: parts.length,
    audioKept: parts.length > 0 || !!row.recordingPath,
    linkedMeeting: row.linkedMeeting ? toMeetingRef(row.linkedMeeting) : null,
    eventSuggestions: eventSuggestions.map(toMeetingRef),
    followUp: toFollowUp(row.report?.insights),
  };
}
