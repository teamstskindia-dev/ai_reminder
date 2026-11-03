import { Injectable, Logger } from '@nestjs/common';
import { UpstreamError } from '../../common/errors/app.exception';
import { renderTemplate } from '../../common/utils/template.util';
import { callExternal } from '../../infra/external/external-call';
import { GeminiService, parseJsonLoose } from '../../infra/gemini/gemini.service';
import { PermanentJobError } from '../../infra/queue/base.processor';
import { StorageService } from '../../infra/storage/storage.service';
import { SettingsService } from '../content/settings.service';
import type { SegmentInput } from '../meetings/meetings.repository';
import { PromptsRepository } from './prompts.repository';
import { TRANSCRIPTION_RESPONSE_SCHEMA, transcriptionOutputSchema } from './report.schema';

export const AUDIO_MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
};

/** Uploaded audio → speaker-labelled segments through the Gemini Files API (`audio_transcription`). */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(
    private readonly gemini: GeminiService,
    private readonly storage: StorageService,
    private readonly prompts: PromptsRepository,
    private readonly settings: SettingsService,
  ) {}

  async transcribe(recordingPath: string): Promise<SegmentInput[]> {
    if (this.gemini.isMock) {
      return [
        {
          seq: 0,
          speaker: 'Speaker 1',
          text: 'This is a mock transcription of the uploaded recording.',
          startMs: 0,
          endMs: 4000,
        },
        {
          seq: 1,
          speaker: 'Speaker 2',
          text: "Great, I'll send the summary to the team by Friday.",
          startMs: 4500,
          endMs: 8000,
        },
      ];
    }
    const ext = recordingPath.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = AUDIO_MIME_BY_EXT[ext];
    if (!mimeType) throw new PermanentJobError(`Unsupported audio extension ".${ext}"`);
    const audio = await callExternal(
      { provider: 'storage', operation: 'download', retries: 2, timeoutMs: 120_000 },
      () => this.storage.download(recordingPath),
    );
    const [ai, prompt] = await Promise.all([this.settings.get('ai'), this.prompts.get('audio_transcription')]);
    if (!prompt) throw new UpstreamError('gemini', 'The audio_transcription prompt is missing.', undefined, false);
    const text = await this.gemini.transcribeAudio({
      model: ai.model,
      prompt: renderTemplate(prompt.content, {}),
      audio,
      mimeType,
      responseSchema: TRANSCRIPTION_RESPONSE_SCHEMA,
      maxOutputTokens: Math.max(ai.maxOutputTokens, 32_768),
    });
    let parsed;
    try {
      parsed = transcriptionOutputSchema.parse(parseJsonLoose(text));
    } catch (err) {
      throw new UpstreamError('gemini', 'The AI returned an invalid transcription.', err, false);
    }
    const segments = parsed.segments
      .filter((s) => s.text)
      .sort((a, b) => a.startMs - b.startMs)
      .map((s, i) => ({ seq: i, speaker: s.speaker, text: s.text, startMs: s.startMs, endMs: s.endMs }));
    this.logger.log({ segments: segments.length, audioBytes: audio.size }, 'audio transcribed');
    return segments;
  }
}
