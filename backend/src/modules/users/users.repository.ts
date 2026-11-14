import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { PlanLimits } from '../../common/types/api.types';
import type { GoogleAccountRow, UserRow, UserSettingsRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { toPlanLimits, USER_INCLUDE, UserWithPlan } from './users.mapper';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<UserWithPlan | null> {
    return this.prisma.user.findUnique({ where: { id }, include: USER_INCLUDE });
  }

  async getById(id: string): Promise<UserWithPlan> {
    const user = await this.findById(id);
    if (!user) throw AppException.notFound('User');
    return user;
  }

  findByGoogleSub(googleSub: string): Promise<UserRow | null> {
    return this.prisma.user.findUnique({ where: { googleSub } });
  }

  findByAppleSub(appleSub: string): Promise<UserRow | null> {
    return this.prisma.user.findUnique({ where: { appleSub } });
  }

  /** Case-insensitive (matches the `lower(email)` unique index). */
  findByEmail(email: string): Promise<UserRow | null> {
    return this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
  }

  /** Creates the user and their settings row atomically. */
  createWithSettings(
    user: Prisma.UserUncheckedCreateInput,
    settings: Omit<Prisma.UserSettingsUncheckedCreateInput, 'userId'>,
  ): Promise<UserRow> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: user });
      await tx.userSettings.create({ data: { ...settings, userId: created.id } });
      return created;
    });
  }

  update(id: string, data: Prisma.UserUncheckedUpdateInput): Promise<UserRow> {
    return this.prisma.user.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }

  async defaultPlanId(): Promise<string | null> {
    const plan = await this.prisma.plan.findFirst({
      where: { isDefault: true, isActive: true },
      select: { id: true },
    });
    return plan?.id ?? null;
  }

  async planLimits(userId: string): Promise<PlanLimits> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: { select: { limits: true } } },
    });
    return toPlanLimits(row?.plan?.limits);
  }

  // ---- settings ----
  getSettings(userId: string): Promise<UserSettingsRow> {
    return this.prisma.userSettings.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  updateSettings(userId: string, data: Prisma.UserSettingsUncheckedUpdateInput): Promise<UserSettingsRow> {
    return this.prisma.userSettings.update({ where: { userId }, data });
  }

  /** Active users with daily digest on (keyset-paged by user id). */
  listDigestCandidates(afterUserId: string | null, limit: number) {
    return this.prisma.userSettings.findMany({
      where: { dailyDigest: true, user: { status: 'active' }, ...(afterUserId ? { userId: { gt: afterUserId } } : {}) },
      select: {
        userId: true,
        digestHour: true,
        user: { select: { id: true, timezone: true, name: true, email: true } },
      },
      orderBy: { userId: 'asc' },
      take: limit,
    });
  }
}

@Injectable()
export class GoogleAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(userId: string): Promise<GoogleAccountRow | null> {
    return this.prisma.googleAccount.findUnique({ where: { userId } });
  }

  upsert(
    userId: string,
    create: Omit<Prisma.GoogleAccountUncheckedCreateInput, 'userId'>,
    update: Prisma.GoogleAccountUncheckedUpdateInput,
  ): Promise<GoogleAccountRow> {
    return this.prisma.googleAccount.upsert({ where: { userId }, create: { ...create, userId }, update });
  }

  async update(userId: string, data: Prisma.GoogleAccountUncheckedUpdateInput): Promise<void> {
    await this.prisma.googleAccount.updateMany({ where: { userId }, data });
  }

  /** User ids with a connected calendar (active users only), keyset-paged. */
  async listConnectedUserIds(afterUserId: string | null, limit: number): Promise<string[]> {
    const rows = await this.prisma.googleAccount.findMany({
      where: {
        calendarConnected: true,
        user: { status: 'active' },
        ...(afterUserId ? { userId: { gt: afterUserId } } : {}),
      },
      select: { userId: true },
      orderBy: { userId: 'asc' },
      take: limit,
    });
    return rows.map((r) => r.userId);
  }
}
