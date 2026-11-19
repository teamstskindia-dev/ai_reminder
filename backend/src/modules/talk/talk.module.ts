import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';
import { CompanionModule } from '../companion/companion.module';
import { ConnectionsModule } from '../connections/connections.module';
import { EmailModule } from '../email/email.module';
import { RemindersModule } from '../reminders/reminders.module';
import { ToolsModule } from '../tools/tools.module';
import { UsersModule } from '../users/users.module';
import { TalkController } from './talk.controller';
import { TalkService } from './talk.service';

/** Talk with your friend (user-flow §05), with email (§07) and tools (§08). */
@Module({
  imports: [
    AiModule,
    CompanionModule,
    RemindersModule,
    CalendarModule,
    UsersModule,
    ConnectionsModule,
    EmailModule,
    ToolsModule,
  ],
  controllers: [TalkController],
  providers: [TalkService],
})
export class TalkModule {}
