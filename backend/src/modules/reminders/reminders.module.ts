import { Module } from '@nestjs/common';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { RemindersRepository } from './reminders.repository';
import { RemindersService } from './reminders.service';

@Module({
  providers: [RemindersRepository, ReminderSchedulerService, RemindersService],
  exports: [RemindersRepository, ReminderSchedulerService, RemindersService],
})
export class RemindersModule {}
