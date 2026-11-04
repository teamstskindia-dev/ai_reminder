import { Module } from '@nestjs/common';
import { MeetingsCoreModule } from '../../meetings/meetings-core.module';
import { NotificationProducer } from '../../notifications/notification-producer.service';
import { UsersModule } from '../../users/users.module';
import { RecallDispatcher } from '../recall/recall-dispatcher.service';
import { MeetRunner } from './meet-runner';
import { MeetingBotProcessor } from './meeting-bot.processor';
import { SimulateRunner } from './simulate-runner';

/** The `meeting-bot` consumer (self-hosted runner + Recall.ai dispatch); imported only by the bot process root module. */
@Module({
  imports: [MeetingsCoreModule, UsersModule],
  providers: [MeetingBotProcessor, NotificationProducer, MeetRunner, SimulateRunner, RecallDispatcher],
})
export class BotRunnerModule {}
