import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../../config/app-config';
import { PrismaClient } from '../../generated/prisma/client';

const logger = new Logger('Prisma');

/**
 * Prisma 7 client over node-postgres (`@prisma/adapter-pg`). DATABASE_URL is the Supabase pooled
 * (transaction-mode) connection; the adapter does not use named prepared statements, so it is
 * safe behind Supavisor/PgBouncer without extra flags. Shared by api, worker and bot.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: AppConfig) {
    super({
      adapter: new PrismaPg(
        {
          connectionString: config.database.url,
          max: config.database.poolMax,
          connectionTimeoutMillis: 10_000,
          idleTimeoutMillis: 30_000,
        },
        { onPoolError: (err) => logger.warn(`Postgres pool error: ${err.message}`) },
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      logger.log('Database client ready');
    } catch (err) {
      logger.error(`Database connection failed (will retry on demand): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`select 1`;
      return true;
    } catch {
      return false;
    }
  }
}
