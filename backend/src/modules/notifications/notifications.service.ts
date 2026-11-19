import { Injectable } from '@nestjs/common';
import { Paginated } from '../../common/pagination/pagination';
import type { AppNotification } from '../../common/types/api.types';
import { safeTimeZone, zonedParts } from '../../common/utils/time.util';
import { UsersRepository } from '../users/users.repository';
import { DeliveryService } from './delivery.service';
import { toNotification } from './notifications.mapper';
import { NotificationsRepository } from './notifications.repository';

/** A push opened later than this does not teach the friend anything about timing. */
const OPENED_WINDOW_MS = 6 * 3600_000;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly delivery: DeliveryService,
    private readonly users: UsersRepository,
  ) {}

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

  /**
   * The user tapped the push (user-flow §09 "learns timing"): marks it read and records that pushes at that
   * local hour get answered.
   */
  async opened(userId: string, id: string): Promise<AppNotification> {
    const before = await this.notifications.markRead(userId, id);
    if (Date.now() - before.createdAt.getTime() <= OPENED_WINDOW_MS) {
      const user = await this.users.findById(userId);
      const hour = zonedParts(before.createdAt, safeTimeZone(user?.timezone ?? 'UTC')).hour;
      await this.delivery.recordEngagement(userId, hour, 1).catch(() => undefined);
    }
    return toNotification(before);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    return { updated: await this.notifications.markAllRead(userId) };
  }
}
