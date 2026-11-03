import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { RepeatableJobsService } from './infra/queue/repeatable-jobs.service';
import { AiModule } from './modules/ai/ai.module';
import { AiProcessor } from './modules/ai/ai.processor';
import { CalendarSyncProcessor } from './modules/calendar/calendar-sync.processor';
import { CalendarModule } from './modules/calendar/calendar.module';
import { BroadcastDispatchService } from './modules/notifications/broadcast-dispatch.service';
import { DigestService } from './modules/notifications/digest.service';
import { DigestProcessor, NotificationsProcessor } from './modules/notifications/notifications.processor';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReminderDispatchService } from './modules/notifications/reminder-dispatch.service';
import { RemindersModule } from './modules/reminders/reminders.module';
import { UsersModule } from './modules/users/users.module';

/** Worker process: calendar-sync, ai-processing, notifications and digest processors + repeatable jobs. */
@Module({
  imports: [CoreModule, UsersModule, CalendarModule, AiModule, NotificationsModule, RemindersModule],
  providers: [
    RepeatableJobsService,
    ReminderDispatchService,
    BroadcastDispatchService,
    DigestService,
    CalendarSyncProcessor,
    AiProcessor,
    NotificationsProcessor,
    DigestProcessor,
  ],
})
export class WorkerModule {}
