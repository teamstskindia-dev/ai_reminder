import type {
  ActionItem,
  Attendee,
  MeetingDetail,
  MeetingListItem,
  MeetingPlatform,
  MeetingReport,
  MeetingSource,
  MeetingStatus,
  Participant,
  ReportSummary,
  SentimentLabel,
  TranscriptSegment,
} from '../../common/types/api.types';
import { numOrNull } from '../../common/utils/postgrest.util';
import type {
  ActionItemRow,
  MeetingParticipantRow,
  MeetingReportRow,
  MeetingRow,
  TranscriptSegmentRow,
} from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';

export const MEETING_LIST_INCLUDE = {
  report: {
    select: {
      summary: true,
      meetingScore: true,
      engagementScore: true,
      sentimentScore: true,
      sentimentLabel: true,
      topics: true,
    },
  },
  _count: { select: { actionItems: true } },
} satisfies Prisma.MeetingInclude;

export const MEETING_DETAIL_INCLUDE = {
  report: true,
  participants: { orderBy: { talkTimeSeconds: 'desc' } },
  actionItems: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.MeetingInclude;

export type MeetingListRow = Prisma.MeetingGetPayload<{ include: typeof MEETING_LIST_INCLUDE }>;
export type MeetingDetailRow = Prisma.MeetingGetPayload<{ include: typeof MEETING_DETAIL_INCLUDE }>;
type ReportSummaryRow = MeetingListRow['report'] & object;

export function toAttendees(raw: unknown): Attendee[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map((a) => ({
      email: typeof a.email === 'string' ? a.email : '',
      name: typeof a.name === 'string' ? a.name : null,
      responseStatus: typeof a.responseStatus === 'string' ? a.responseStatus : null,
      organizer: a.organizer === true,
    }));
}

export function summaryPreview(summary: string, max = 240): string {
  const plain = summary
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

export function toReportSummary(r: ReportSummaryRow | MeetingReportRow): ReportSummary {
  return {
    summaryPreview: summaryPreview(r.summary ?? ''),
    meetingScore: numOrNull(r.meetingScore),
    engagementScore: numOrNull(r.engagementScore),
    sentimentScore: numOrNull(r.sentimentScore),
    sentimentLabel: (r.sentimentLabel as SentimentLabel | null) ?? null,
    topics: r.topics ?? [],
  };
}

function baseItem(row: MeetingRow): Omit<MeetingListItem, 'report' | 'actionItemCount'> {
  return {
    id: row.id,
    title: row.title,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt?.toISOString() ?? null,
    platform: row.platform as MeetingPlatform,
    meetingUrl: row.meetingUrl,
    status: row.status as MeetingStatus,
    source: row.source as MeetingSource,
    autoJoin: row.autoJoin,
    durationSeconds: row.durationSeconds,
    organizerEmail: row.organizerEmail,
    attendeeCount: toAttendees(row.attendees).length,
  };
}

export function toMeetingListItem(row: MeetingListRow): MeetingListItem {
  return {
    ...baseItem(row),
    actionItemCount: row._count.actionItems,
    report: row.report ? toReportSummary(row.report) : null,
  };
}

export function toMeetingReport(r: MeetingReportRow): MeetingReport {
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    summary: r.summary,
    keyPoints: arr<string>(r.keyPoints),
    chapters: arr<{ title: string; summary: string; startMs: number }>(r.chapters),
    keyQuestions: arr<{ question: string; answer: string | null; askedBy: string | null }>(r.keyQuestions),
    decisions: arr<string>(r.decisions),
    topics: r.topics ?? [],
    meetingScore: numOrNull(r.meetingScore),
    engagementScore: numOrNull(r.engagementScore),
    sentimentScore: numOrNull(r.sentimentScore),
    sentimentLabel: (r.sentimentLabel as SentimentLabel | null) ?? null,
    model: r.model,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toParticipant(p: MeetingParticipantRow): Participant {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    talkTimeSeconds: p.talkTimeSeconds,
    wordCount: p.wordCount,
    talkRatio: Number(p.talkRatio),
  };
}

export function toActionItem(row: ActionItemRow, meetingTitle: string | null): ActionItem {
  return {
    id: row.id,
    meetingId: row.meetingId,
    meetingTitle,
    title: row.title,
    description: row.description,
    assigneeName: row.assigneeName,
    assigneeEmail: row.assigneeEmail,
    isMine: row.isMine,
    dueAt: row.dueAt?.toISOString() ?? null,
    priority: row.priority as ActionItem['priority'],
    status: row.status as ActionItem['status'],
    source: row.source as ActionItem['source'],
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toMeetingDetail(row: MeetingDetailRow): MeetingDetail {
  return {
    ...baseItem(row),
    actionItemCount: row.actionItems.length,
    description: row.description,
    attendees: toAttendees(row.attendees),
    participants: row.participants.map(toParticipant),
    report: row.report ? toMeetingReport(row.report) : null,
    actionItems: row.actionItems.map((i) => toActionItem(i, row.title)),
    botJoinedAt: row.botJoinedAt?.toISOString() ?? null,
    botLeftAt: row.botLeftAt?.toISOString() ?? null,
    failureReason: row.failureReason,
  };
}

export function toTranscriptSegment(s: TranscriptSegmentRow): TranscriptSegment {
  return { seq: s.seq, speaker: s.speaker, text: s.text, startMs: s.startMs, endMs: s.endMs };
}
