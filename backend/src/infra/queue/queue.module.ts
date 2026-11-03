import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { QUEUE, QUEUE_DEFAULTS } from './queue.constants';

const queueRegistrations = Object.values(QUEUE).map((name) =>
  BullModule.registerQueue({ name, defaultJobOptions: QUEUE_DEFAULTS[name] }),
);

/**
 * Registers every queue as a producer in every process. Processors are only added by the
 * worker / bot root modules, so the API never consumes jobs.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        connection: { url: config.redisUrl, maxRetriesPerRequest: null },
      }),
    }),
    ...queueRegistrations,
  ],
  exports: [...queueRegistrations],
})
export class QueueModule {}
