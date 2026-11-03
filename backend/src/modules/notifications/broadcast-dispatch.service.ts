import { Injectable, Logger } from '@nestjs/common';
import type { BroadcastAudience } from '../../common/types/api.types';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PermanentJobError } from '../../infra/queue/base.processor';
import { normalizeChannels } from '../reminders/reminders.mapper';
import { DeliveryService } from './delivery.service';

const PAGE = 500;

/** Delivers an admin broadcast to its audience (paged by user id); updates `sent_count`. */
@Injectable()
export class BroadcastDispatchService {
  private readonly logger = new Logger(BroadcastDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryService,
  ) {}

  async dispatch(broadcastId: string): Promise<number> {
    const broadcast = await this.prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) throw new PermanentJobError('Broadcast no longer exists');
    if (broadcast.sentCount > 0) return broadcast.sentCount; // already delivered (idempotent retry)
    const audience = broadcast.audience as unknown as BroadcastAudience;
    const where: Prisma.UserWhereInput = { status: 'active' };
    if (audience?.type === 'users') where.id = { in: audience.userIds };
    else if (audience?.type === 'plan') where.planId = audience.planId;

    const channels = normalizeChannels(broadcast.channels);
    const data = { ...((broadcast.data as Record<string, unknown> | null) ?? {}), broadcastId };
    let cursor: string | undefined;
    let sent = 0;
    for (;;) {
      const users = await this.prisma.user.findMany({
        where: cursor ? { ...where, id: { ...(where.id as object), gt: cursor } } : where,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: PAGE,
      });
      if (!users.length) break;
      for (const u of users) {
        try {
          const res = await this.delivery.deliver({
            userId: u.id,
            type: 'broadcast',
            channels,
            data,
            fallback: { title: broadcast.title, body: broadcast.body },
          });
          if (res.delivered.length) sent++;
        } catch (err) {
          this.logger.warn(
            { broadcastId, userId: u.id, errName: (err as Error).name },
            'broadcast delivery failed for user',
          );
        }
      }
      cursor = users[users.length - 1].id;
      if (users.length < PAGE) break;
    }
    await this.prisma.broadcast.update({ where: { id: broadcastId }, data: { sentCount: sent } });
    this.logger.log({ broadcastId, sent }, 'broadcast delivered');
    return sent;
  }
}
