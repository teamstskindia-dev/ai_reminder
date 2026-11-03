import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/pagination/pagination';
import type { ActionItem } from '../../common/types/api.types';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { toActionItem } from '../meetings/meetings.mapper';
import { ReminderSchedulerService } from '../reminders/reminder-scheduler.service';
import { RemindersRepository } from '../reminders/reminders.repository';
import { DEFAULT_REMINDER_CHANNELS, RemindersService } from '../reminders/reminders.service';
import { CreateActionItemDto, ListActionItemsQueryDto, UpdateActionItemDto } from './action-items.dto';

const INCLUDE = { meeting: { select: { title: true } } } satisfies Prisma.ActionItemInclude;
type ActionItemWithMeeting = Prisma.ActionItemGetPayload<{ include: typeof INCLUDE }>;
const map = (row: ActionItemWithMeeting): ActionItem => toActionItem(row, row.meeting?.title ?? null);

@Injectable()
export class ActionItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: RemindersRepository,
    private readonly remindersService: RemindersService,
    private readonly scheduler: ReminderSchedulerService,
  ) {}

  async list(userId: string, q: ListActionItemsQueryDto): Promise<Paginated<ActionItem>> {
    const where: Prisma.ActionItemWhereInput = {
      userId,
      ...(q.status !== 'all' ? { status: q.status } : {}),
      ...(q.meetingId ? { meetingId: q.meetingId } : {}),
      ...(q.mine ? { isMine: true } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.actionItem.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.actionItem.count({ where }),
    ]);
    return Paginated.of(rows.map(map), total, q.page, q.limit);
  }

  async openSoonest(userId: string, limit = 5): Promise<ActionItem[]> {
    const rows = await this.prisma.actionItem.findMany({
      where: { userId, status: 'open' },
      include: INCLUDE,
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: limit,
    });
    return rows.map(map);
  }

  private async findOwned(userId: string, id: string): Promise<ActionItemWithMeeting> {
    const row = await this.prisma.actionItem.findFirst({ where: { id, userId }, include: INCLUDE });
    if (!row) throw AppException.notFound('Action item');
    return row;
  }

  async create(userId: string, dto: CreateActionItemDto): Promise<ActionItem> {
    if (dto.meetingId && !(await this.reminders.meetingBelongsTo(userId, dto.meetingId))) {
      throw AppException.notFound('Meeting');
    }
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.remind && (!dueAt || dueAt.getTime() <= Date.now())) {
      throw AppException.validation([{ field: 'dueAt', messages: ['a future dueAt is required when remind is true'] }]);
    }
    const row = await this.prisma.actionItem.create({
      data: {
        userId,
        meetingId: dto.meetingId ?? null,
        title: dto.title.trim(),
        description: dto.description ?? null,
        dueAt,
        priority: dto.priority ?? 'medium',
        source: 'manual',
        isMine: true,
      },
      include: INCLUDE,
    });
    if (dto.remind && dueAt) {
      await this.remindersService.createAndSchedule({
        userId,
        actionItemId: row.id,
        meetingId: row.meetingId,
        type: 'action_item_due',
        source: 'manual',
        title: row.title,
        remindAt: dueAt,
        channels: DEFAULT_REMINDER_CHANNELS,
      });
    }
    return map(row);
  }

  async update(userId: string, id: string, dto: UpdateActionItemDto): Promise<ActionItem> {
    const current = await this.findOwned(userId, id);
    const data: Prisma.ActionItemUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.status !== undefined && dto.status !== current.status) {
      data.status = dto.status;
      data.completedAt = dto.status === 'done' ? new Date() : null;
    }
    const updated = Object.keys(data).length
      ? await this.prisma.actionItem.update({ where: { id }, data, include: INCLUDE })
      : current;

    const pending = await this.reminders.pendingForActionItem(id);
    if (updated.status !== 'open') {
      await this.remindersService.cancelMany(pending);
    } else if (dto.dueAt !== undefined) {
      for (const r of pending.filter((p) => p.type === 'action_item_due')) {
        if (updated.dueAt && updated.dueAt.getTime() > Date.now()) {
          await this.scheduler.schedule(await this.reminders.update(r.id, { remindAt: updated.dueAt }));
        } else {
          await this.remindersService.cancelMany([r]);
        }
      }
    }
    return map(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.remindersService.cancelMany(await this.reminders.pendingForActionItem(id));
    await this.prisma.actionItem.delete({ where: { id } });
  }
}
