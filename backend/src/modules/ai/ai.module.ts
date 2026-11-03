import { Module } from '@nestjs/common';
import { MeetingsCoreModule } from '../meetings/meetings-core.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersModule } from '../reminders/reminders.module';
import { AiPipelineService } from './ai-pipeline.service';
import { EmbeddingService } from './embedding.service';
import { PromptsRepository } from './prompts.repository';
import { ReportGeneratorService } from './report-generator.service';
import { TranscriptionService } from './transcription.service';

/** AI services (api uses the generator for /admin/ai/test and embeddings for Ask AI; worker runs the pipeline). */
@Module({
  imports: [MeetingsCoreModule, RemindersModule, NotificationsModule],
  providers: [PromptsRepository, ReportGeneratorService, EmbeddingService, TranscriptionService, AiPipelineService],
  exports: [PromptsRepository, ReportGeneratorService, EmbeddingService, TranscriptionService, AiPipelineService],
})
export class AiModule {}
