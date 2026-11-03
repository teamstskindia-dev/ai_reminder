import { Module } from '@nestjs/common';
import { MeetingEventsService } from './meeting-events.service';
import { MeetingsRepository, TranscriptRepository } from './meetings.repository';

/** Data access + status events for meetings, shared by api, worker and bot. */
@Module({
  providers: [MeetingsRepository, TranscriptRepository, MeetingEventsService],
  exports: [MeetingsRepository, TranscriptRepository, MeetingEventsService],
})
export class MeetingsCoreModule {}
