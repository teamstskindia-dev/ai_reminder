import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MemoryService } from './memory.service';
import { PeopleModule } from './people.module';
import { PrivacyService } from './privacy.service';

/**
 * Memory, You and privacy (user-flow §10), shared by the api (controllers in ApiModule) and the worker
 * (the data export job runs on the companion queue).
 */
@Module({
  imports: [AiModule, PeopleModule, NotificationsModule],
  providers: [MemoryService, PrivacyService],
  exports: [MemoryService, PrivacyService, PeopleModule],
})
export class MemoryModule {}
