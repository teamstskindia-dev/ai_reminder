import { loadDotEnv } from './config/load-env';
loadDotEnv();

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { installProcessHandlers } from './common/lifecycle/process-lifecycle';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  // Workers let in-flight jobs finish on SIGTERM (BullMQ worker.close), bounded by this timeout.
  // Signals are handled by installProcessHandlers → app.close() (runs every shutdown hook once).
  installProcessHandlers(app, logger, { name: 'worker', shutdownTimeoutMs: 60_000 });
  await app.init();
  logger.log('Worker started (calendar-sync, ai-processing, notifications, digest)', 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
