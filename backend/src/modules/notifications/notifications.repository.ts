import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { NotificationRow, NotificationTemplateRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CacheService } from '../../infra/redis/cache.service';
import { RedisKeys } from '../../infra/redis/redis.constants';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, unreadOnly: boolean, page: number, limit: number) {
    const where: Prisma.NotificationWhereInput = { userId, ...(unreadOnly ? { readAt: null } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { rows, total };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<NotificationRow> {
    const row = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!row) throw AppException.notFound('Notification');
    if (row.readAt) return row;
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }

  create(data: Prisma.NotificationUncheckedCreateInput): Promise<NotificationRow> {
    return this.prisma.notification.create({ data });
  }
}

const TEMPLATES_TTL_SECONDS = 600;

@Injectable()
export class TemplatesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getAll(): Promise<NotificationTemplateRow[]> {
    const cached = await this.cache.get<(Omit<NotificationTemplateRow, 'updatedAt'> & { updatedAt: string })[]>(
      RedisKeys.templates(),
    );
    if (cached) return cached.map((t) => ({ ...t, updatedAt: new Date(t.updatedAt) }));
    const rows = await this.prisma.notificationTemplate.findMany({ orderBy: { key: 'asc' } });
    await this.cache.set(RedisKeys.templates(), rows, TEMPLATES_TTL_SECONDS);
    return rows;
  }

  async get(key: string): Promise<NotificationTemplateRow | null> {
    return (await this.getAll()).find((t) => t.key === key) ?? null;
  }

  findFresh(key: string): Promise<NotificationTemplateRow | null> {
    return this.prisma.notificationTemplate.findUnique({ where: { key } });
  }

  update(key: string, data: Prisma.NotificationTemplateUncheckedUpdateInput): Promise<NotificationTemplateRow> {
    return this.prisma.notificationTemplate.update({ where: { key }, data });
  }
}
