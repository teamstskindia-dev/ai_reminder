import { Module } from '@nestjs/common';
import { BotSchedulingModule } from '../bot/bot-scheduling.module';
import { MeetingsCoreModule } from './meetings-core.module';
import { MeetingsService } from './meetings.service';
import { UploadService } from './upload.service';

@Module({
  imports: [MeetingsCoreModule, BotSchedulingModule],
  providers: [MeetingsService, UploadService],
  exports: [MeetingsService, UploadService, MeetingsCoreModule],
})
export class MeetingsModule {}
