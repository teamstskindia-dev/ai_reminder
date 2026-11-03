import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { ReminderRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REMINDER_INCLUDE, ReminderWithMeeting } from './reminders.mapper';

export interface ReminderListFilter {
  status?: 'pending' | 'sent' | 'cancelled' | 'all';
  from?: string;
  to?: string;
}

@Injectable()
export class RemindersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    filter: ReminderListFilter,
    page: number,
    limit: number,
  ): Promise<{ rows: ReminderWithMeeting[]; total: number }> {
    const where: Prisma.ReminderWhereInput = { userId };
    if (filter.status && filter.status !== 'all') where.status = filter.status;
    if (filter.from || filter.to) {
      where.remindAt = {
        ...(filter.from ? { gte: new Date(filter.from) } : {}),
        ...(filter.to ? { lte: new Date(filter.to) } : {}),
      };
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.reminder.findMany({
        where,
        include: REMINDER_INCLUDE,
        orderBy: [{ remindAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.reminder.count({ where }),
    ]);
    return { rows, total };
  }

  upcomingPending(userId: string, limit: number): Promise<ReminderWithMeeting[]> {
    return this.prisma.reminder.findMany({
      where: { userId, status: 'pending', remindAt: { gte: new Date() } },
      include: REMINDER_INCLUDE,
      orderBy: { remindAt: 'asc' },
      take: limit,
    });
  }

  async findForUser(userId: string, id: string): Promise<ReminderWithMeeting> {
    const row = await this.prisma.reminder.findFirst({ where: { id, userId }, include: REMINDER_INCLUDE });
    if (!row) throw AppException.notFound('Reminder');
    return row;
  }

  findById(id: string): Promise<ReminderWithMeeting | null> {
    return this.prisma.reminder.findUnique({ where: { id }, include: REMINDER_INCLUDE });
  }

  insert(data: Prisma.ReminderUncheckedCreateInput): Promise<ReminderWithMeeting> {
    return this.prisma.reminder.create({ data, include: REMINDER_INCLUDE });
  }

  update(id: string, data: Prisma.ReminderUncheckedUpdateInput): Promise<ReminderWithMeeting> {
    return this.prisma.reminder.update({ where: { id }, data, include: REMINDER_INCLUDE });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.reminder.delete({ where: { id } });
  }

  findMeetingUpcoming(meetingId: string): Promise<ReminderRow | null> {
    return this.prisma.reminder.findFirst({ where: { meetingId, type: 'meeting_upcoming' } });
  }

  pendingForActionItem(actionItemId: string): Promise<ReminderRow[]> {
    return this.prisma.reminder.findMany({ where: { actionItemId, status: 'pending' } });
  }

  pendingAiForMeeting(meetingId: string): Promise<ReminderRow[]> {
    return this.prisma.reminder.findMany({ where: { meetingId, source: 'ai', status: 'pending' } });
  }

  pendingForMeeting(meetingId: string): Promise<ReminderRow[]> {
    return this.prisma.reminder.findMany({ where: { meetingId, status: 'pending' } });
  }

  async meetingBelongsTo(userId: string, meetingId: string): Promise<boolean> {
    return (await this.prisma.meeting.count({ where: { id: meetingId, userId } })) > 0;
  }

  async actionItemBelongsTo(userId: string, actionItemId: string): Promise<boolean> {
    return (await this.prisma.actionItem.count({ where: { id: actionItemId, userId } })) > 0;
  }
}
