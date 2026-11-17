import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { BotSchedulingModule } from '../bot/bot-scheduling.module';
import { MeetingPrepService } from './meeting-prep.service';
import { MeetingsCoreModule } from './meetings-core.module';
import { MeetingsService } from './meetings.service';
import { UploadService } from './upload.service';

@Module({
  imports: [MeetingsCoreModule, BotSchedulingModule, AiModule],
  providers: [MeetingsService, UploadService, MeetingPrepService],
  exports: [MeetingsService, UploadService, MeetingPrepService, MeetingsCoreModule],
})
export class MeetingsModule {}
