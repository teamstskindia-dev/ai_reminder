import type { AutoJoinMode, Integration, PlanLimits, User, UserSettings } from '../../common/types/api.types';
import type { GoogleAccountRow, UserSettingsRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';

export const USER_INCLUDE = {
  plan: { select: { id: true, slug: true, name: true } },
  googleAccount: { select: { calendarConnected: true } },
} satisfies Prisma.UserInclude;

export type UserWithPlan = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

export function toUser(row: UserWithPlan): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    timezone: row.timezone,
    locale: row.locale,
    status: row.status as User['status'],
    plan: row.plan ? { id: row.plan.id, slug: row.plan.slug, name: row.plan.name } : null,
    calendarConnected: row.googleAccount?.calendarConnected ?? false,
    onboardedAt: row.onboardedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toUserSettings(row: UserSettingsRow): UserSettings {
  return {
    autoJoin: row.autoJoin as AutoJoinMode,
    botName: row.botName,
    meetingReminderMinutes: row.meetingReminderMinutes,
    dailyDigest: row.dailyDigest,
    digestHour: row.digestHour,
    emailNotifications: row.emailNotifications,
    pushNotifications: row.pushNotifications,
  };
}

export function toIntegration(row: GoogleAccountRow | null): Integration {
  return {
    provider: 'google_calendar',
    connected: row?.calendarConnected ?? false,
    accountEmail: row?.googleEmail ?? null,
    lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
    syncError: row?.syncError ?? null,
  };
}

export function toPlanLimits(raw: unknown): PlanLimits {
  const l = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    meetingsPerMonth: n(l.meetingsPerMonth),
    aiQueriesPerDay: n(l.aiQueriesPerDay),
    uploadMinutesPerMonth: n(l.uploadMinutesPerMonth),
  };
}
