import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';
import { CompanionModule } from '../companion/companion.module';
import { RemindersModule } from '../reminders/reminders.module';
import { UsersModule } from '../users/users.module';
import { TalkController } from './talk.controller';
import { TalkService } from './talk.service';

/** Talk with your friend (user-flow §05). */
@Module({
  imports: [AiModule, CompanionModule, RemindersModule, CalendarModule, UsersModule],
  controllers: [TalkController],
  providers: [TalkService],
})
export class TalkModule {}
