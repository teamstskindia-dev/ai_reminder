import { Injectable } from '@nestjs/common';
import { Paginated } from '../../common/pagination/pagination';
import type { AppNotification } from '../../common/types/api.types';
import { toNotification } from './notifications.mapper';
import { NotificationsRepository } from './notifications.repository';

@Injectable()
export class NotificationsService {
  constructor(private readonly notifications: NotificationsRepository) {}

  async list(userId: string, unreadOnly: boolean, page: number, limit: number): Promise<Paginated<AppNotification>> {
    const { rows, total } = await this.notifications.list(userId, unreadOnly, page, limit);
    return Paginated.of(rows.map(toNotification), total, page, limit);
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(userId) };
  }

  async markRead(userId: string, id: string): Promise<AppNotification> {
    return toNotification(await this.notifications.markRead(userId, id));
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    return { updated: await this.notifications.markAllRead(userId) };
  }
}
