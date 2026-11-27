import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CompanionModule } from '../companion/companion.module';
import { RemindersModule } from '../reminders/reminders.module';
import { UsersModule } from '../users/users.module';
import { CapturesController } from './captures.controller';
import { CapturesService } from './captures.service';

/** Tap to record a conversation (user-flow §04); processing runs in the worker's AI pipeline. */
@Module({
  imports: [AiModule, RemindersModule, CompanionModule, UsersModule],
  controllers: [CapturesController],
  providers: [CapturesService],
})
export class CapturesModule {}
