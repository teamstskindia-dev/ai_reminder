import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig } from './config/app-config';
import { AppConfigModule } from './config/config.module';
import { buildLoggerParams } from './common/logging/logger.config';
import { InfraModule } from './infra/infra.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { QueueModule } from './infra/queue/queue.module';
import { RedisModule } from './infra/redis/redis.module';
import { SettingsModule } from './modules/content/settings.module';

/** Infrastructure shared by the api, worker and bot processes (each registers only its own processors). */
@Global()
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        buildLoggerParams({ level: config.logLevel, pretty: !config.isProduction, http: true }),
    }),
    PrismaModule,
    RedisModule,
    QueueModule,
    InfraModule,
    SettingsModule,
  ],
  exports: [AppConfigModule, PrismaModule, RedisModule, QueueModule, InfraModule, SettingsModule],
})
export class CoreModule {}
