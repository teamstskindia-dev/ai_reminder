import { loadDotEnv } from './config/load-env';
loadDotEnv();

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { BotAppModule } from './bot-app.module';
import { getAppConfig } from './config/config.module';
import { installProcessHandlers } from './common/lifecycle/process-lifecycle';

async function bootstrap(): Promise<void> {
  const config = getAppConfig();
  const app = await NestFactory.createApplicationContext(BotAppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  // On SIGTERM active sessions leave their calls, save captured segments and enqueue AI (≤45s).
  // Signals are handled by installProcessHandlers → app.close() (runs every shutdown hook once).
  installProcessHandlers(app, logger, { name: 'bot', shutdownTimeoutMs: 55_000 });
  await app.init();
  logger.log(`Bot started (mode=${config.bot.mode}, concurrency=${config.bot.concurrency})`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
