import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CheckinService } from './checkin.service';
import { CompanionChatService } from './companion-chat.service';
import { CompanionContextService } from './companion-context.service';
import { MoodInsightsService } from './mood-insights.service';
import { NudgeService } from './nudge.service';
import { RecapService } from './recap.service';

/**
 * Daily rhythm (user-flow §03), shared by the api and the worker. Worker-only pieces (morning brief,
 * night learning, the rhythm tick and the processor) are registered in WorkerModule; the Today
 * aggregate (TodayService) in ApiModule.
 */
@Module({
  imports: [AiModule, NotificationsModule],
  providers: [
    CompanionContextService,
    CompanionChatService,
    CheckinService,
    NudgeService,
    RecapService,
    MoodInsightsService,
  ],
  exports: [
    CompanionContextService,
    CompanionChatService,
    CheckinService,
    NudgeService,
    RecapService,
    MoodInsightsService,
  ],
})
export class CompanionModule {}
