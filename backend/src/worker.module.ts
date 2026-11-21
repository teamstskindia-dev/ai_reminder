import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { RepeatableJobsService } from './infra/queue/repeatable-jobs.service';
import { AiModule } from './modules/ai/ai.module';
import { AiProcessor } from './modules/ai/ai.processor';
import { BotEventsModule } from './modules/bot/recall/bot-events.module';
import { CalendarSyncProcessor } from './modules/calendar/calendar-sync.processor';
import { CalendarModule } from './modules/calendar/calendar.module';
import { CompanionProcessor } from './modules/companion/companion.processor';
import { CompanionModule } from './modules/companion/companion.module';
import { MeetingPromptsService } from './modules/companion/meeting-prompts.service';
import { MorningBriefService } from './modules/companion/morning-brief.service';
import { NightlyService } from './modules/companion/nightly.service';
import { RhythmService } from './modules/companion/rhythm.service';
import { BroadcastDispatchService } from './modules/notifications/broadcast-dispatch.service';
import { DigestService } from './modules/notifications/digest.service';
import { DigestProcessor, NotificationsProcessor } from './modules/notifications/notifications.processor';
import { EmailModule } from './modules/email/email.module';
import { IntegrationsProcessor } from './modules/integrations/integrations.processor';
import { ToolsModule } from './modules/tools/tools.module';
import { MemoryModule } from './modules/memory/memory.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReminderDispatchService } from './modules/notifications/reminder-dispatch.service';
import { RemindersModule } from './modules/reminders/reminders.module';
import { UsersModule } from './modules/users/users.module';

/**
 * Worker process: calendar-sync, bot-events, ai-processing, notifications, digest, companion (daily
 * rhythm) and integrations (email, tools) processors + repeatable jobs.
 */
@Module({
  imports: [
    CoreModule,
    UsersModule,
    CalendarModule,
    AiModule,
    NotificationsModule,
    RemindersModule,
    BotEventsModule,
    CompanionModule,
    EmailModule,
    ToolsModule,
    MemoryModule,
  ],
  providers: [
    RepeatableJobsService,
    ReminderDispatchService,
    BroadcastDispatchService,
    DigestService,
    CalendarSyncProcessor,
    AiProcessor,
    NotificationsProcessor,
    DigestProcessor,
    MorningBriefService,
    MeetingPromptsService,
    NightlyService,
    RhythmService,
    CompanionProcessor,
    IntegrationsProcessor,
  ],
})
export class WorkerModule {}
