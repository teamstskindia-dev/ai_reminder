import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { MeetingRow, TranscriptSegmentRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MEETING_DETAIL_INCLUDE, MEETING_LIST_INCLUDE, MeetingDetailRow, MeetingListRow } from './meetings.mapper';

export const LIVE_STATUSES = ['joining', 'waiting_room', 'in_progress'];
export const UPCOMING_STATUSES = ['scheduled', 'joining', 'waiting_room', 'in_progress', 'skipped'];
/** Statuses that consume a `meetingsPerMonth` slot. */
const PLAN_COUNTED_STATUSES = ['joining', 'waiting_room', 'in_progress', 'processing', 'completed'];

export interface MeetingListFilter {
  userId?: string;
  scope?: 'upcoming' | 'past' | 'all';
  status?: string;
  q?: string;
  from?: string;
  to?: string;
}

export const ADMIN_MEETING_INCLUDE = {
  ...MEETING_LIST_INCLUDE,
  user: { select: { id: true, email: true, name: true } },
} satisfies Prisma.MeetingInclude;
export type AdminMeetingRow = Prisma.MeetingGetPayload<{ include: typeof ADMIN_MEETING_INCLUDE }>;

export interface SegmentInput {
  seq: number;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number | null;
}

@Injectable()
export class MeetingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  buildWhere(filter: MeetingListFilter, now = new Date()): Prisma.MeetingWhereInput {
    const and: Prisma.MeetingWhereInput[] = [];
    if (filter.userId) and.push({ userId: filter.userId });
    if (filter.scope === 'upcoming') {
      and.push({ status: { in: UPCOMING_STATUSES } });
      and.push({ OR: [{ startAt: { gte: now } }, { endAt: { gte: now } }, { status: { in: LIVE_STATUSES } }] });
    } else if (filter.scope === 'past') {
      and.push({ startAt: { lt: now } }, { status: { notIn: LIVE_STATUSES } });
    }
    if (filter.status) {
      const statuses = filter.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length) and.push({ status: { in: statuses } });
    }
    const q = filter.q?.trim();
    if (q) and.push({ title: { contains: q.slice(0, 100), mode: 'insensitive' } });
    if (filter.from) and.push({ startAt: { gte: new Date(filter.from) } });
    if (filter.to) and.push({ startAt: { lte: new Date(filter.to) } });
    return and.length ? { AND: and } : {};
  }

  async list(
    filter: MeetingListFilter,
    page: number,
    limit: number,
    ascending: boolean,
  ): Promise<{ rows: MeetingListRow[]; total: number }> {
    const where = this.buildWhere(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.meeting.findMany({
        where,
        include: MEETING_LIST_INCLUDE,
        orderBy: [{ startAt: ascending ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.meeting.count({ where }),
    ]);
    return { rows, total };
  }

  async listForAdmin(
    filter: MeetingListFilter,
    page: number,
    limit: number,
  ): Promise<{ rows: AdminMeetingRow[]; total: number }> {
    const where = this.buildWhere(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.meeting.findMany({
        where,
        include: ADMIN_MEETING_INCLUDE,
        orderBy: [{ startAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.meeting.count({ where }),
    ]);
    return { rows, total };
  }

  listItems(where: Prisma.MeetingWhereInput, orderBy: Prisma.MeetingOrderByWithRelationInput, take: number) {
    return this.prisma.meeting.findMany({ where, include: MEETING_LIST_INCLUDE, orderBy, take });
  }

  async findDetailForUser(userId: string, id: string): Promise<MeetingDetailRow> {
    const row = await this.prisma.meeting.findFirst({ where: { id, userId }, include: MEETING_DETAIL_INCLUDE });
    if (!row) throw AppException.notFound('Meeting');
    return row;
  }

  async findDetail(id: string): Promise<MeetingDetailRow> {
    const row = await this.prisma.meeting.findUnique({ where: { id }, include: MEETING_DETAIL_INCLUDE });
    if (!row) throw AppException.notFound('Meeting');
    return row;
  }

  findById(id: string): Promise<MeetingRow | null> {
    return this.prisma.meeting.findUnique({ where: { id } });
  }

  async findForUser(userId: string, id: string): Promise<MeetingRow> {
    const row = await this.prisma.meeting.findFirst({ where: { id, userId } });
    if (!row) throw AppException.notFound('Meeting');
    return row;
  }

  findByCalendarEvent(userId: string, calendarEventId: string): Promise<MeetingRow | null> {
    return this.prisma.meeting.findUnique({ where: { userId_calendarEventId: { userId, calendarEventId } } });
  }

  insert(data: Prisma.MeetingUncheckedCreateInput): Promise<MeetingRow> {
    return this.prisma.meeting.create({ data });
  }

  upsertCalendarEvent(
    userId: string,
    calendarEventId: string,
    create: Omit<Prisma.MeetingUncheckedCreateInput, 'userId' | 'calendarEventId'>,
    update: Prisma.MeetingUncheckedUpdateInput,
  ): Promise<MeetingRow> {
    return this.prisma.meeting.upsert({
      where: { userId_calendarEventId: { userId, calendarEventId } },
      create: { ...create, userId, calendarEventId },
      update,
    });
  }

  update(id: string, data: Prisma.MeetingUncheckedUpdateInput): Promise<MeetingRow> {
    return this.prisma.meeting.update({ where: { id }, data });
  }

  /** Conditional update (only when the current status is one of `from`). Returns null if nothing matched. */
  async updateIfStatus(
    id: string,
    from: string[],
    data: Prisma.MeetingUncheckedUpdateInput,
  ): Promise<MeetingRow | null> {
    const { count } = await this.prisma.meeting.updateMany({ where: { id, status: { in: from } }, data });
    return count ? this.findById(id) : null;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.meeting.delete({ where: { id } });
  }

  /** Meetings that count against `meetingsPerMonth` in [from, to), excluding one meeting. */
  countTowardsPlan(userId: string, from: Date, to: Date, excludeId?: string): Promise<number> {
    return this.prisma.meeting.count({
      where: {
        userId,
        startAt: { gte: from, lt: to },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [{ status: { in: PLAN_COUNTED_STATUSES } }, { status: 'scheduled', botJobId: { not: null } }],
      },
    });
  }

  /** Near-future meetings whose bot/reminder scheduling may need re-evaluation. */
  schedulable(userId: string): Promise<MeetingRow[]> {
    return this.prisma.meeting.findMany({
      where: {
        userId,
        status: { in: ['scheduled', 'skipped'] },
        startAt: { gte: new Date(Date.now() - 6 * 3600_000) },
      },
      orderBy: { startAt: 'asc' },
      take: 500,
    });
  }

  countByUser(userId: string, status?: string): Promise<number> {
    return this.prisma.meeting.count({ where: { userId, ...(status ? { status } : {}) } });
  }
}

@Injectable()
export class TranscriptRepository {
  constructor(private readonly prisma: PrismaService) {}

  listAll(meetingId: string): Promise<TranscriptSegmentRow[]> {
    return this.prisma.transcriptSegment.findMany({ where: { meetingId }, orderBy: { seq: 'asc' } });
  }

  async insertMany(meetingId: string, segments: SegmentInput[]): Promise<void> {
    for (let i = 0; i < segments.length; i += 500) {
      await this.prisma.transcriptSegment.createMany({
        data: segments.slice(i, i + 500).map((s) => ({ ...s, meetingId })),
        skipDuplicates: true,
      });
    }
  }

  /** Replaces the whole transcript atomically (uploads / re-transcription). */
  async replaceAll(meetingId: string, segments: SegmentInput[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.transcriptSegment.deleteMany({ where: { meetingId } }),
      this.prisma.transcriptSegment.createMany({ data: segments.map((s) => ({ ...s, meetingId })) }),
    ]);
  }

  count(meetingId: string): Promise<number> {
    return this.prisma.transcriptSegment.count({ where: { meetingId } });
  }

  async maxSeq(meetingId: string): Promise<number> {
    const agg = await this.prisma.transcriptSegment.aggregate({ where: { meetingId }, _max: { seq: true } });
    return agg._max.seq ?? -1;
  }
}
