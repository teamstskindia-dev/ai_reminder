import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/pagination/pagination';
import type { Reminder, ReminderChannel } from '../../common/types/api.types';
import type { ReminderRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { CreateReminderDto, ListRemindersQueryDto, UpdateReminderDto } from './dto/reminders.dto';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { ReminderWithMeeting, toReminder } from './reminders.mapper';
import { RemindersRepository } from './reminders.repository';

export const DEFAULT_REMINDER_CHANNELS: ReminderChannel[] = ['push', 'in_app'];

@Injectable()
export class RemindersService {
  constructor(
    private readonly reminders: RemindersRepository,
    private readonly scheduler: ReminderSchedulerService,
  ) {}

  async list(userId: string, q: ListRemindersQueryDto): Promise<Paginated<Reminder>> {
    const { rows, total } = await this.reminders.list(userId, q, q.page, q.limit);
    return Paginated.of(rows.map(toReminder), total, q.page, q.limit);
  }

  async upcoming(userId: string, limit = 5): Promise<Reminder[]> {
    return (await this.reminders.upcomingPending(userId, limit)).map(toReminder);
  }

  async create(userId: string, dto: CreateReminderDto): Promise<Reminder> {
    const remindAt = this.futureDate(dto.remindAt);
    if (dto.meetingId && !(await this.reminders.meetingBelongsTo(userId, dto.meetingId))) {
      throw AppException.notFound('Meeting');
    }
    if (dto.actionItemId && !(await this.reminders.actionItemBelongsTo(userId, dto.actionItemId))) {
      throw AppException.notFound('Action item');
    }
    const row = await this.createAndSchedule({
      userId,
      title: dto.title.trim(),
      body: dto.body ?? null,
      remindAt,
      channels: dto.channels ?? DEFAULT_REMINDER_CHANNELS,
      meetingId: dto.meetingId ?? null,
      actionItemId: dto.actionItemId ?? null,
      type: 'custom',
      source: 'manual',
    });
    return toReminder(row);
  }

  async update(userId: string, id: string, dto: UpdateReminderDto): Promise<Reminder> {
    const current = await this.reminders.findForUser(userId, id);
    const data: Prisma.ReminderUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.channels !== undefined) data.channels = dto.channels;
    if (dto.remindAt !== undefined) {
      data.remindAt = this.futureDate(dto.remindAt);
      if (current.status !== 'cancelled') {
        data.status = 'pending';
        data.sentAt = null;
        data.failureReason = null;
      }
    }
    if (dto.status === 'cancelled') data.status = 'cancelled';
    const updated = Object.keys(data).length ? await this.reminders.update(id, data) : current;
    if (updated.status === 'pending') await this.scheduler.schedule(updated);
    else if (current.status === 'pending') await this.scheduler.unschedule(id);
    return toReminder(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.reminders.findForUser(userId, id);
    await this.scheduler.unschedule(id);
    await this.reminders.delete(id);
  }

  async snooze(userId: string, id: string, minutes: number): Promise<Reminder> {
    const current = await this.reminders.findForUser(userId, id);
    if (current.status === 'cancelled') throw AppException.conflict('Cancelled reminders cannot be snoozed');
    const updated = await this.reminders.update(id, {
      remindAt: new Date(Date.now() + minutes * 60_000),
      status: 'pending',
      sentAt: null,
      failureReason: null,
    });
    await this.scheduler.schedule(updated);
    return toReminder(updated);
  }

  /** Inserts a reminder row and schedules its delayed job (used by AI, scheduler and action items). */
  async createAndSchedule(data: Prisma.ReminderUncheckedCreateInput): Promise<ReminderWithMeeting> {
    const inserted = await this.reminders.insert({ status: 'pending', ...data });
    await this.scheduler.schedule(inserted);
    return inserted;
  }

  async cancelMany(rows: Pick<ReminderRow, 'id'>[]): Promise<void> {
    for (const r of rows) {
      await this.scheduler.unschedule(r.id);
      await this.reminders.update(r.id, { status: 'cancelled' });
    }
  }

  private futureDate(value: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw AppException.validation([{ field: 'remindAt', messages: ['invalid date'] }]);
    if (d.getTime() <= Date.now()) {
      throw AppException.validation([{ field: 'remindAt', messages: ['remindAt must be in the future'] }]);
    }
    return d;
  }
}
