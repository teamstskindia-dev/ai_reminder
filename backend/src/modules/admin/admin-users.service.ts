import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import { securityLog } from '../../common/logging/security-log';
import { Paginated } from '../../common/pagination/pagination';
import type {
  AdminDashboardStats,
  AdminMeetingListItem,
  AdminUserDetail,
  AdminUserListItem,
  MeetingDetail,
} from '../../common/types/api.types';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { removeJob } from '../../infra/queue/job-utils';
import { JobId, QUEUE } from '../../infra/queue/queue.constants';
import { RefreshSessionService } from '../auth/refresh-session.service';
import { toDevice } from '../devices/devices.repository';
import { toMeetingDetail, toMeetingListItem, toTranscriptSegment } from '../meetings/meetings.mapper';
import { MeetingsRepository, TranscriptRepository } from '../meetings/meetings.repository';
import { MeetingsService } from '../meetings/meetings.service';
import { AccountDeletionService } from '../users/account-deletion.service';
import { toIntegration, toUser, toUserSettings, USER_INCLUDE } from '../users/users.mapper';
import { UsersRepository } from '../users/users.repository';
import { AdminMeetingsQueryDto, AdminUpdateUserDto, AdminUsersQueryDto } from './dto/admin.dto';
import { QueueAdminService } from './queue-admin.service';

const USER_SORT: Record<string, Prisma.UserOrderByWithRelationInput> = {
  'createdAt:desc': { createdAt: 'desc' },
  'createdAt:asc': { createdAt: 'asc' },
  'lastLoginAt:desc': { lastLoginAt: { sort: 'desc', nulls: 'last' } },
  'email:asc': { email: 'asc' },
};

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly meetings: MeetingsRepository,
    private readonly transcripts: TranscriptRepository,
    private readonly meetingsService: MeetingsService,
    private readonly deletion: AccountDeletionService,
    private readonly sessions: RefreshSessionService,
    private readonly queues: QueueAdminService,
    @InjectQueue(QUEUE.MEETING_BOT) private readonly botQueue: Queue,
  ) {}

  // ---------- users ----------
  async listUsers(q: AdminUsersQueryDto): Promise<Paginated<AdminUserListItem>> {
    const search = q.q?.trim().slice(0, 100);
    const where: Prisma.UserWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.planId ? { planId: q.planId } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { ...USER_INCLUDE, _count: { select: { meetings: true } } },
        orderBy: [USER_SORT[q.sort ?? 'createdAt:desc'] ?? { createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return Paginated.of(
      rows.map((r) => ({
        ...toUser(r),
        lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
        meetingsCount: r._count.meetings,
      })),
      total,
      q.page,
      q.limit,
    );
  }

  async userDetail(id: string): Promise<AdminUserDetail> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      include: { ...USER_INCLUDE, _count: { select: { meetings: true, actionItems: true, reminders: true } } },
    });
    if (!row) throw AppException.notFound('User');
    const [settings, account, devices, completed] = await Promise.all([
      this.users.getSettings(id),
      this.prisma.googleAccount.findUnique({ where: { userId: id } }),
      this.prisma.device.findMany({ where: { userId: id }, orderBy: { lastSeenAt: 'desc' } }),
      this.prisma.meeting.count({ where: { userId: id, status: 'completed' } }),
    ]);
    return {
      ...toUser(row),
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      meetingsCount: row._count.meetings,
      settings: toUserSettings(settings),
      integration: toIntegration(account),
      devices: devices.map(toDevice),
      stats: {
        meetings: row._count.meetings,
        completedMeetings: completed,
        actionItems: row._count.actionItems,
        reminders: row._count.reminders,
      },
    };
  }

  async updateUser(id: string, dto: AdminUpdateUserDto): Promise<AdminUserDetail> {
    const current = await this.users.getById(id);
    if (dto.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId }, select: { id: true } });
      if (!plan) throw AppException.notFound('Plan');
    }
    await this.users.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.planId !== undefined ? { planId: dto.planId } : {}),
    });
    if (dto.status === 'suspended' && current.status !== 'suspended') await this.suspendSideEffects(id);
    return this.userDetail(id);
  }

  /** Suspension: revoke every session and cancel the user's scheduled bots. */
  private async suspendSideEffects(userId: string): Promise<void> {
    await this.sessions.revokeAll('user', userId);
    securityLog('user_sessions_revoked', { userId, reason: 'suspended' });
    const scheduled = await this.prisma.meeting.findMany({
      where: { userId, status: { in: ['scheduled', 'skipped'] }, botJobId: { not: null } },
      select: { id: true },
    });
    for (const m of scheduled) await removeJob(this.botQueue, JobId.bot(m.id));
    if (scheduled.length) {
      await this.prisma.meeting.updateMany({
        where: { id: { in: scheduled.map((m) => m.id) } },
        data: { botJobId: null },
      });
    }
  }

  deleteUser(id: string): Promise<void> {
    return this.deletion.deleteUser(id);
  }

  // ---------- meetings ----------
  async listMeetings(q: AdminMeetingsQueryDto): Promise<Paginated<AdminMeetingListItem>> {
    const { rows, total } = await this.meetings.listForAdmin(
      { userId: q.userId, status: q.status, q: q.q, from: q.from, to: q.to },
      q.page,
      q.limit,
    );
    return Paginated.of(
      rows.map((r) => ({
        ...toMeetingListItem(r),
        user: { id: r.user.id, email: r.user.email, name: r.user.name },
        failureReason: r.failureReason,
      })),
      total,
      q.page,
      q.limit,
    );
  }

  async meetingDetail(
    id: string,
  ): Promise<MeetingDetail & { user: { id: string; email: string; name: string | null } }> {
    const row = await this.meetings.findDetail(id);
    const user = await this.prisma.user.findUnique({
      where: { id: row.userId },
      select: { id: true, email: true, name: true },
    });
    return { ...toMeetingDetail(row), user: user ?? { id: row.userId, email: '', name: null } };
  }

  async transcript(id: string) {
    await this.meetings.findDetail(id);
    return (await this.transcripts.listAll(id)).map(toTranscriptSegment);
  }

  async reprocess(id: string): Promise<{ queued: true }> {
    const meeting = await this.meetings.findById(id);
    if (!meeting) throw AppException.notFound('Meeting');
    return this.meetingsService.enqueueReprocess(meeting);
  }

  async deleteMeeting(id: string): Promise<void> {
    const meeting = await this.meetings.findById(id);
    if (!meeting) throw AppException.notFound('Meeting');
    await this.meetingsService.remove(meeting.userId, id);
  }

  // ---------- dashboard ----------
  async dashboardStats(): Promise<AdminDashboardStats> {
    const [rows, queues] = await Promise.all([
      this.prisma.$queryRaw<{ stats: Omit<AdminDashboardStats, 'queues'> }[]>(
        Prisma.sql`select public.admin_dashboard_stats() as stats`,
      ),
      this.queues.stats(),
    ]);
    return { ...rows[0].stats, queues };
  }
}
