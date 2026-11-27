import { Module } from '@nestjs/common';
import { MeetingsCoreModule } from '../meetings/meetings-core.module';
import { PeopleModule } from '../memory/people.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersModule } from '../reminders/reminders.module';
import { UsersModule } from '../users/users.module';
import { AiPipelineService } from './ai-pipeline.service';
import { CaptureInsightsService } from './capture-insights.service';
import { EmbeddingService } from './embedding.service';
import { PromptsRepository } from './prompts.repository';
import { ReportGeneratorService } from './report-generator.service';
import { TranscriptionService } from './transcription.service';

/** AI services (api uses the generator for /admin/ai/test and embeddings for Ask AI; worker runs the pipeline). */
@Module({
  imports: [MeetingsCoreModule, RemindersModule, NotificationsModule, PeopleModule, UsersModule],
  providers: [
    PromptsRepository,
    ReportGeneratorService,
    EmbeddingService,
    TranscriptionService,
    CaptureInsightsService,
    AiPipelineService,
  ],
  exports: [
    PromptsRepository,
    ReportGeneratorService,
    EmbeddingService,
    TranscriptionService,
    CaptureInsightsService,
    AiPipelineService,
  ],
})
export class AiModule {}
