import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';
import { CompanionModule } from '../companion/companion.module';
import { ConnectionsModule } from '../connections/connections.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersModule } from '../reminders/reminders.module';
import { EmailSyncService } from './email-sync.service';
import { EmailTriageService } from './email-triage.service';
import { EmailService } from './email.service';

/** Reading your email (user-flow §07), shared by the api (EmailService) and the worker (EmailSyncService). */
@Module({
  imports: [AiModule, CalendarModule, CompanionModule, ConnectionsModule, NotificationsModule, RemindersModule],
  providers: [EmailService, EmailSyncService, EmailTriageService],
  exports: [EmailService, EmailSyncService],
})
export class EmailModule {}
