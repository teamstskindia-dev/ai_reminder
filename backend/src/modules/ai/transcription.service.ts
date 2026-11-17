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

/** One uploaded part of a capture, in recording order. */
export interface RecordingPart {
  index: number;
  path: string;
  durationMs: number;
  bytes?: number;
}

/** Reads `meetings.recording_parts` defensively (it is JSON). */
export function toRecordingParts(raw: unknown): RecordingPart[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .filter((p) => typeof p.path === 'string' && Number.isInteger(p.index))
    .map((p) => ({
      index: p.index as number,
      path: p.path as string,
      durationMs: typeof p.durationMs === 'number' && p.durationMs > 0 ? Math.round(p.durationMs) : 0,
      bytes: typeof p.bytes === 'number' ? p.bytes : undefined,
    }))
    .sort((a, b) => a.index - b.index);
}

/**
 * Joins per-part transcripts into one: each part's times are shifted by the duration of the parts before
 * it, and `seq` is renumbered. A part without a known duration falls back to its last segment's end.
 */
export function mergePartSegments(parts: { durationMs: number; segments: SegmentInput[] }[]): SegmentInput[] {
  const out: SegmentInput[] = [];
  let offset = 0;
  for (const part of parts) {
    for (const s of part.segments) {
      out.push({
        seq: out.length,
        speaker: s.speaker,
        text: s.text,
        startMs: s.startMs + offset,
        endMs: s.endMs === null || s.endMs === undefined ? null : s.endMs + offset,
      });
    }
    const lastEnd = part.segments.reduce((max, s) => Math.max(max, s.endMs ?? s.startMs), 0);
    offset += part.durationMs > 0 ? part.durationMs : lastEnd;
  }
  return out;
}

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

  /** A capture recorded in parts: each part is transcribed on its own, then the transcripts are joined. */
  async transcribeParts(parts: RecordingPart[]): Promise<SegmentInput[]> {
    const results: { durationMs: number; segments: SegmentInput[] }[] = [];
    for (const part of parts) {
      results.push({ durationMs: part.durationMs, segments: await this.transcribe(part.path) });
    }
    return mergePartSegments(results);
  }
}
