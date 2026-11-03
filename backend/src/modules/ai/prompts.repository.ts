import { Injectable } from '@nestjs/common';
import type { AiPrompt } from '../../common/types/api.types';
import type { AiPromptRow } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CacheService } from '../../infra/redis/cache.service';
import { RedisKeys } from '../../infra/redis/redis.constants';

export function toAiPrompt(row: AiPromptRow): AiPrompt {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    content: row.content,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const PROMPTS_TTL_SECONDS = 300;

@Injectable()
export class PromptsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getAll(): Promise<AiPrompt[]> {
    return this.cache.wrap(RedisKeys.prompts(), PROMPTS_TTL_SECONDS, async () =>
      (await this.prisma.aiPrompt.findMany({ orderBy: { key: 'asc' } })).map(toAiPrompt),
    );
  }

  async get(key: string): Promise<AiPrompt | null> {
    return (await this.getAll()).find((p) => p.key === key) ?? null;
  }

  /** Updates content (and optionally name/description) and increments `version` atomically. */
  async update(
    key: string,
    data: { content: string; name?: string; description?: string | null },
    adminId: string,
  ): Promise<AiPromptRow> {
    return this.prisma.aiPrompt.update({
      where: { key },
      data: {
        content: data.content,
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        version: { increment: 1 },
        updatedBy: adminId,
      },
    });
  }
}
