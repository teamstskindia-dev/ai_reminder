import { Module } from '@nestjs/common';
import { MeetingsCoreModule } from '../meetings/meetings-core.module';
import { RemindersModule } from '../reminders/reminders.module';
import { UsersModule } from '../users/users.module';
import { MeetingSchedulerService } from './meeting-scheduler.service';

@Module({
  imports: [MeetingsCoreModule, UsersModule, RemindersModule],
  providers: [MeetingSchedulerService],
  exports: [MeetingSchedulerService],
})
export class BotSchedulingModule {}
