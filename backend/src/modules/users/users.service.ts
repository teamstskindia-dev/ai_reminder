import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { User, UserSettings } from '../../common/types/api.types';
import { Prisma } from '../../infra/prisma/models';
import { UpdateMeDto, UpdateUserSettingsDto } from './dto/users.dto';
import { toUser, toUserSettings } from './users.mapper';
import { UsersRepository } from './users.repository';

export function normalizeSenders(list: string[]): string[] {
  return [...new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/** null turns the mode off; otherwise a future time at most `maxHours` ahead. */
function futureWithin(value: string | null, maxHours: number, field: string): Date | null {
  if (value === null) return null;
  const at = new Date(value);
  const now = Date.now();
  if (Number.isNaN(at.getTime()) || at.getTime() <= now || at.getTime() > now + maxHours * 3600_000 + 60_000) {
    throw AppException.validation([{ field, messages: [`${field} must be in the next ${maxHours} hours`] }]);
  }
  return at;
}

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async getUser(userId: string): Promise<User> {
    return toUser(await this.users.getById(userId));
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<User> {
    const data: Prisma.UserUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.timezone !== undefined) data.timezone = dto.timezone;
    if (dto.locale !== undefined) data.locale = dto.locale;
    if (dto.onboarded) {
      const current = await this.users.getById(userId);
      if (!current.onboardedAt) data.onboardedAt = new Date();
    }
    if (Object.keys(data).length) await this.users.update(userId, data);
    return this.getUser(userId);
  }

  async getSettings(userId: string): Promise<UserSettings> {
    return toUserSettings(await this.users.getSettings(userId));
  }

  /** Returns the new settings and whether bot/reminder scheduling must be re-evaluated. */
  async updateSettings(
    userId: string,
    dto: UpdateUserSettingsDto,
  ): Promise<{ settings: UserSettings; reschedule: boolean }> {
    const before = await this.users.getSettings(userId);
    const data: Prisma.UserSettingsUncheckedUpdateInput = {};
    if (dto.autoJoin !== undefined) data.autoJoin = dto.autoJoin;
    if (dto.botName !== undefined) data.botName = dto.botName === null ? null : dto.botName.trim();
    if (dto.meetingReminderMinutes !== undefined) data.meetingReminderMinutes = dto.meetingReminderMinutes;
    if (dto.dailyDigest !== undefined) data.dailyDigest = dto.dailyDigest;
    if (dto.digestHour !== undefined) data.digestHour = dto.digestHour;
    if (dto.emailNotifications !== undefined) data.emailNotifications = dto.emailNotifications;
    if (dto.pushNotifications !== undefined) data.pushNotifications = dto.pushNotifications;
    if (dto.wakeTime !== undefined) data.wakeTime = dto.wakeTime;
    if (dto.quietHoursStart !== undefined) data.quietHoursStart = dto.quietHoursStart;
    if (dto.quietHoursEnd !== undefined) data.quietHoursEnd = dto.quietHoursEnd;
    if (dto.checkinTime !== undefined) data.checkinTime = dto.checkinTime;
    if (dto.morningBrief !== undefined) data.morningBrief = dto.morningBrief;
    if (dto.eveningCheckin !== undefined) data.eveningCheckin = dto.eveningCheckin;
    if (dto.recordingConsentAcknowledged && !before.recordingConsentAt) data.recordingConsentAt = new Date();
    if (dto.emailAlerts !== undefined) data.emailAlerts = dto.emailAlerts;
    if (dto.vipSenders !== undefined) data.vipSenders = normalizeSenders(dto.vipSenders);
    if (dto.mutedSenders !== undefined) data.mutedSenders = normalizeSenders(dto.mutedSenders);
    if (dto.pushBudget !== undefined) data.pushBudget = dto.pushBudget;
    if (dto.criticalBreakThrough !== undefined) data.criticalBreakThrough = dto.criticalBreakThrough;
    if (dto.focusUntil !== undefined) data.focusUntil = futureWithin(dto.focusUntil, 24, 'focusUntil');
    if (dto.nudgesPausedUntil !== undefined) {
      data.nudgesPausedUntil = futureWithin(dto.nudgesPausedUntil, 30 * 24, 'nudgesPausedUntil');
    }
    const after = Object.keys(data).length ? await this.users.updateSettings(userId, data) : before;
    const reschedule =
      after.autoJoin !== before.autoJoin || after.meetingReminderMinutes !== before.meetingReminderMinutes;
    return { settings: toUserSettings(after), reschedule };
  }
}
