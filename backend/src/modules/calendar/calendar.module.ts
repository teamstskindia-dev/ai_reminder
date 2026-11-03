import { Module } from '@nestjs/common';
import { BotSchedulingModule } from '../bot/bot-scheduling.module';
import { MeetingsCoreModule } from '../meetings/meetings-core.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersModule } from '../reminders/reminders.module';
import { UsersModule } from '../users/users.module';
import { CalendarConnectionService } from './calendar-connection.service';
import { CalendarSyncService } from './calendar-sync.service';

/** Calendar sync services (shared by api and worker; the processor is registered by the worker only). */
@Module({
  imports: [UsersModule, MeetingsCoreModule, BotSchedulingModule, RemindersModule, NotificationsModule],
  providers: [CalendarSyncService, CalendarConnectionService],
  exports: [CalendarSyncService, CalendarConnectionService],
})
export class CalendarModule {}
