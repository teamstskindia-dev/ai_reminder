import { Module } from '@nestjs/common';
import { MeetingsCoreModule } from '../../meetings/meetings-core.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { BotEventsProcessor } from './bot-events.processor';
import { RecallEventsService } from './recall-events.service';

/** Worker side of the Recall.ai provider: the `bot-events` consumer (status updates + transcript import). */
@Module({
  imports: [MeetingsCoreModule, NotificationsModule],
  providers: [RecallEventsService, BotEventsProcessor],
})
export class BotEventsModule {}
