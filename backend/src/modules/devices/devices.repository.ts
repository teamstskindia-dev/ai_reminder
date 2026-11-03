import { Injectable } from '@nestjs/common';
import type { Device } from '../../common/types/api.types';
import type { DeviceRow } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';

export function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    platform: row.platform as Device['platform'],
    deviceName: row.deviceName,
    appVersion: row.appVersion,
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

@Injectable()
export class DevicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(userId: string): Promise<DeviceRow[]> {
    return this.prisma.device.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' } });
  }

  async tokensForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.device.findMany({ where: { userId }, select: { expoPushToken: true } });
    return rows.map((r) => r.expoPushToken);
  }

  /** Upsert by token: a token moves to the latest user that registers it. */
  upsert(
    userId: string,
    data: { expoPushToken: string; platform: string; deviceName: string | null; appVersion: string | null },
  ): Promise<DeviceRow> {
    const now = new Date();
    return this.prisma.device.upsert({
      where: { expoPushToken: data.expoPushToken },
      create: { ...data, userId, lastSeenAt: now },
      update: { ...data, userId, lastSeenAt: now },
    });
  }

  async deleteForUser(userId: string, expoPushToken: string): Promise<number> {
    const { count } = await this.prisma.device.deleteMany({ where: { userId, expoPushToken } });
    return count;
  }

  async deleteTokens(tokens: string[]): Promise<void> {
    if (tokens.length) await this.prisma.device.deleteMany({ where: { expoPushToken: { in: tokens } } });
  }
}
