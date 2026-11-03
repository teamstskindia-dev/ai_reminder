import { Module } from '@nestjs/common';
import { RemindersModule } from '../reminders/reminders.module';
import { ActionItemsService } from './action-items.service';

@Module({
  imports: [RemindersModule],
  providers: [ActionItemsService],
  exports: [ActionItemsService],
})
export class ActionItemsModule {}
