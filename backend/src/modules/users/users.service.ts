import { Injectable } from '@nestjs/common';
import type { User, UserSettings } from '../../common/types/api.types';
import { Prisma } from '../../infra/prisma/models';
import { UpdateMeDto, UpdateUserSettingsDto } from './dto/users.dto';
import { toUser, toUserSettings } from './users.mapper';
import { UsersRepository } from './users.repository';

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
    const after = Object.keys(data).length ? await this.users.updateSettings(userId, data) : before;
    const reschedule =
      after.autoJoin !== before.autoJoin || after.meetingReminderMinutes !== before.meetingReminderMinutes;
    return { settings: toUserSettings(after), reschedule };
  }
}
