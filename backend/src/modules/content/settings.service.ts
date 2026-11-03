import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { ISODate } from '../../common/types/api.types';
import type { AppSettingRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CacheService } from '../../infra/redis/cache.service';
import { RedisKeys } from '../../infra/redis/redis.constants';
import { SETTINGS_DEFAULTS } from './settings.defaults';
import {
  isSettingKey,
  PUBLIC_SETTING_KEYS,
  SETTING_KEYS,
  SettingKey,
  SettingValue,
  validateSetting,
} from './settings.schemas';

export interface AppSettingRecord<K extends SettingKey = SettingKey> {
  key: K;
  value: SettingValue[K];
  isPublic: boolean;
  description: string | null;
  updatedAt: ISODate;
}

const SETTINGS_TTL_SECONDS = 300;

/** Typed access to `app_settings` (cached in Redis as `cfg:settings:{key}`), used by every process. */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue[K]> {
    const cached = await this.cache.get<SettingValue[K]>(RedisKeys.setting(key));
    if (cached) return cached;
    let value: SettingValue[K] = SETTINGS_DEFAULTS[key];
    try {
      const row = await this.prisma.appSetting.findUnique({ where: { key } });
      if (row) {
        const parsed = validateSetting(key, row.value);
        if (parsed.success) value = parsed.value;
        else this.logger.warn(`app_settings.${key} is invalid; using defaults`);
      }
    } catch (err) {
      this.logger.warn(`Could not load app_settings.${key}: ${(err as Error).message}; using defaults`);
      return value;
    }
    await this.cache.set(RedisKeys.setting(key), value, SETTINGS_TTL_SECONDS);
    return value;
  }

  async getMany<K extends SettingKey>(keys: K[]): Promise<Pick<SettingValue, K>> {
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Pick<SettingValue, K>;
  }

  async listRecords(): Promise<AppSettingRecord[]> {
    const rows = await this.prisma.appSetting.findMany({ orderBy: { key: 'asc' } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return SETTING_KEYS.map((key) => this.toRecord(key, byKey.get(key)));
  }

  async getRecord(key: string): Promise<AppSettingRecord> {
    if (!isSettingKey(key)) throw AppException.notFound('Setting');
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    return this.toRecord(key, row ?? undefined);
  }

  /** Validates and stores a full setting value. Cache invalidation is the caller's job (ContentCacheService). */
  async update(key: string, value: unknown, adminId: string): Promise<AppSettingRecord> {
    if (!isSettingKey(key)) throw AppException.notFound('Setting');
    const parsed = validateSetting(key, value);
    if (!parsed.success) throw AppException.validation(parsed.errors, `Invalid value for setting "${key}"`);
    const json = parsed.value as unknown as Prisma.InputJsonValue;
    const row = await this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value: json, updatedBy: adminId, isPublic: PUBLIC_SETTING_KEYS.includes(key) },
      update: { value: json, updatedBy: adminId },
    });
    return this.toRecord(key, row);
  }

  private toRecord<K extends SettingKey>(key: K, row: AppSettingRow | undefined): AppSettingRecord<K> {
    let value: SettingValue[K] = SETTINGS_DEFAULTS[key];
    if (row) {
      const parsed = validateSetting(key, row.value);
      value = parsed.success ? parsed.value : (row.value as unknown as SettingValue[K]);
    }
    return {
      key,
      value,
      isPublic: row?.isPublic ?? PUBLIC_SETTING_KEYS.includes(key),
      description: row?.description ?? null,
      updatedAt: (row?.updatedAt ?? new Date(0)).toISOString(),
    };
  }
}
