import type { INestApplicationContext, LoggerService } from '@nestjs/common';

interface LifecycleOptions {
  name: 'api' | 'worker' | 'bot';
  /** Hard limit for a graceful shutdown before the process is force-exited. */
  shutdownTimeoutMs: number;
}

let shuttingDown = false;

/**
 * Process-level safety net: fatal logging for unhandled rejections / uncaught exceptions, graceful
 * shutdown (HTTP server, BullMQ workers, Redis, Prisma, browser via Nest shutdown hooks) and a
 * force-exit timer so a stuck dependency can never hang a deploy.
 */
export function installProcessHandlers(
  app: INestApplicationContext,
  logger: LoggerService,
  opts: LifecycleOptions,
): void {
  const shutdown = (code: number, reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log?.(`${opts.name}: shutting down (${reason})`, 'Lifecycle');
    const timer = setTimeout(() => {
      logger.error?.(
        `${opts.name}: graceful shutdown timed out after ${opts.shutdownTimeoutMs}ms; forcing exit`,
        undefined,
        'Lifecycle',
      );
      process.exit(code || 1);
    }, opts.shutdownTimeoutMs);
    timer.unref();
    app
      .close()
      .then(() => process.exit(code))
      .catch((err: unknown) => {
        logger.error?.(
          `${opts.name}: error during shutdown: ${(err as Error)?.message}`,
          (err as Error)?.stack,
          'Lifecycle',
        );
        process.exit(1);
      });
  };

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    (logger.fatal ?? logger.error).call(logger, `unhandledRejection: ${err.message}`, err.stack, 'Lifecycle');
    shutdown(1, 'unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    (logger.fatal ?? logger.error).call(logger, `uncaughtException: ${err.message}`, err.stack, 'Lifecycle');
    shutdown(1, 'uncaughtException');
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => shutdown(0, signal));
  }
}
