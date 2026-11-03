import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import { detectFileType } from '../../common/files/detect-file-type';
import { validateMeetingUpload } from '../../common/files/file-validation';
import type { MeetingDetail } from '../../common/types/api.types';
import { upsertJob } from '../../infra/queue/job-utils';
import { AiProcessJob, JOB, JobId, QUEUE } from '../../infra/queue/queue.constants';
import { StorageService } from '../../infra/storage/storage.service';
import { SettingsService } from '../content/settings.service';
import { UploadMeetingDto } from './dto/meetings.dto';
import { toMeetingDetail } from './meetings.mapper';
import { MeetingsRepository, TranscriptRepository } from './meetings.repository';
import { detectTranscriptFormat, parseTranscript } from './transcript-parser';

export interface UploadedFile {
  originalname?: string;
  buffer: Buffer;
  size: number;
}

/** POST /meetings/upload: audio → Gemini transcription; txt/vtt/srt → parsed directly; then the AI pipeline. */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly meetings: MeetingsRepository,
    private readonly transcripts: TranscriptRepository,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    @InjectQueue(QUEUE.AI) private readonly aiQueue: Queue,
  ) {}

  async upload(userId: string, dto: UploadMeetingDto, file: UploadedFile | undefined): Promise<MeetingDetail> {
    const features = await this.settings.get('features');
    if (!features.meetingUpload) throw AppException.forbidden('Meeting uploads are disabled');
    if (!file?.buffer) throw AppException.validation([{ field: 'file', messages: ['file is required'] }]);
    if (!this.storage.configured) throw AppException.badRequest('File storage is not configured');

    const upload = validateMeetingUpload(file.originalname, file.buffer, await detectFileType(file.buffer));
    let segments: ReturnType<typeof parseTranscript> = [];
    if (upload.kind === 'transcript') {
      const content = file.buffer.toString('utf8');
      segments = parseTranscript(content, detectTranscriptFormat(upload.displayName, content)).slice(0, 20_000);
      if (!segments.length) throw AppException.badRequest('No transcript lines were found in the file');
    }

    const startAt = dto.startAt ? new Date(dto.startAt) : new Date();
    const meeting = await this.meetings.insert({
      userId,
      source: 'upload',
      title: dto.title.trim(),
      platform: 'other',
      startAt,
      status: 'processing',
      autoJoin: false,
      isOrganizer: true,
    });
    // Server-generated storage name; the client filename is never used in paths.
    const path = `${userId}/${meeting.id}/recording.${upload.ext}`;
    try {
      await this.storage.upload(path, file.buffer, upload.mime);
      await this.meetings.update(meeting.id, { recordingPath: path });
      if (segments.length) {
        await this.transcripts.insertMany(
          meeting.id,
          segments.map((s, i) => ({
            seq: i,
            speaker: s.speaker.slice(0, 120),
            text: s.text.slice(0, 5000),
            startMs: s.startMs,
            endMs: s.endMs,
          })),
        );
      }
      await upsertJob<AiProcessJob>(
        this.aiQueue,
        JOB.AI_PROCESS,
        { meetingId: meeting.id, transcribe: upload.kind === 'audio' },
        { jobId: JobId.ai(meeting.id) },
      );
    } catch (err) {
      await this.storage.remove([path]).catch(() => undefined);
      await this.meetings.delete(meeting.id).catch(() => undefined);
      throw err;
    }
    this.logger.log(
      { meetingId: meeting.id, kind: upload.kind, bytes: file.size, segments: segments.length },
      'meeting uploaded',
    );
    return toMeetingDetail(await this.meetings.findDetail(meeting.id));
  }
}
