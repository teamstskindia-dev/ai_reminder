import { Injectable, Logger } from '@nestjs/common';
import {
  Content,
  createPartFromUri,
  createUserContent,
  FileState,
  FinishReason,
  GenerateContentResponse,
  GoogleGenAI,
  Schema,
} from '@google/genai';
import { AppConfig } from '../../config/app-config';
import { AppException, UpstreamError } from '../../common/errors/app.exception';
import { callExternal } from '../external/external-call';

export const EMBEDDING_DIMENSIONS = 768;

export interface GenerateOptions {
  model: string;
  systemInstruction?: string;
  contents: string | Content[];
  temperature?: number;
  maxOutputTokens?: number;
  operation: string;
}

export interface GenerateJsonOptions extends GenerateOptions {
  responseSchema: Schema;
}

/** The model refused (safety/recitation/blocklist). Retrying the same input will not help. */
export class GeminiBlockedError extends UpstreamError {
  constructor(readonly reason: string) {
    super('gemini', 'The AI service declined to process this content.', undefined, false);
  }
}

const BLOCKING_FINISH = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

/** Throws on blocked/empty responses; returns the text otherwise. */
export function extractText(res: GenerateContentResponse): { text: string; finishReason: string | null } {
  const blockReason = res.promptFeedback?.blockReason;
  if (blockReason) throw new GeminiBlockedError(String(blockReason));
  const candidate = res.candidates?.[0];
  if (!candidate) throw new UpstreamError('gemini', undefined, new Error('Gemini returned no candidates'));
  const finishReason = candidate.finishReason ? String(candidate.finishReason) : null;
  if (finishReason && BLOCKING_FINISH.has(finishReason)) throw new GeminiBlockedError(finishReason);
  const text = res.text ?? '';
  if (!text.trim()) {
    throw new UpstreamError(
      'gemini',
      undefined,
      new Error(`Gemini returned an empty response (finishReason=${finishReason ?? 'unknown'})`),
    );
  }
  return { text, finishReason };
}

/** Thin wrapper over @google/genai. Model names and parameters always come from app_settings.ai. */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private client?: GoogleGenAI;

  constructor(private readonly config: AppConfig) {}

  get isMock(): boolean {
    return this.config.ai.mock;
  }

  private get ai(): GoogleGenAI {
    if (!this.client) {
      const apiKey = this.config.ai.apiKey;
      if (!apiKey) throw AppException.internal('AI is not configured', new Error('GEMINI_API_KEY missing'));
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  /** JSON-mode generation; returns raw text (callers parse + validate with zod). */
  async generateJson(opts: GenerateJsonOptions): Promise<{ text: string; finishReason: string | null }> {
    const res = await callExternal(
      {
        provider: 'gemini',
        operation: opts.operation,
        retries: 2,
        timeoutMs: 180_000,
        baseDelayMs: 2000,
        maxDelayMs: 20_000,
      },
      (signal) =>
        this.ai.models.generateContent({
          model: opts.model,
          contents: opts.contents,
          config: {
            systemInstruction: opts.systemInstruction,
            temperature: opts.temperature,
            maxOutputTokens: opts.maxOutputTokens,
            responseMimeType: 'application/json',
            responseSchema: opts.responseSchema,
            abortSignal: signal,
          },
        }),
    );
    return extractText(res);
  }

  async generateText(opts: GenerateOptions): Promise<string> {
    const res = await callExternal(
      { provider: 'gemini', operation: opts.operation, retries: 1, timeoutMs: 60_000, baseDelayMs: 1000 },
      (signal) =>
        this.ai.models.generateContent({
          model: opts.model,
          contents: opts.contents,
          config: {
            systemInstruction: opts.systemInstruction,
            temperature: opts.temperature,
            maxOutputTokens: opts.maxOutputTokens,
            abortSignal: signal,
          },
        }),
    );
    return extractText(res).text.trim();
  }

  /** Embeds texts (batched). Returns L2-normalised 768-dim vectors. */
  async embed(texts: string[], model: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[][]> {
    if (!texts.length) return [];
    if (this.isMock) return texts.map((t) => mockEmbedding(t));
    const out: number[][] = [];
    const batchSize = 50;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const res = await callExternal(
        { provider: 'gemini', operation: 'embedContent', retries: 3, timeoutMs: 60_000, baseDelayMs: 1000 },
        (signal) =>
          this.ai.models.embedContent({
            model,
            contents: batch,
            config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS, abortSignal: signal },
          }),
      );
      const embeddings = res.embeddings ?? [];
      if (embeddings.length !== batch.length) {
        throw new UpstreamError('gemini', undefined, new Error('unexpected number of embeddings'));
      }
      for (const e of embeddings) {
        const values = e.values ?? [];
        if (values.length !== EMBEDDING_DIMENSIONS) {
          throw new UpstreamError('gemini', undefined, new Error(`embedding has ${values.length} dimensions`), false);
        }
        out.push(normalize(values));
      }
    }
    return out;
  }

  /** Uploads audio to the Gemini Files API and runs a schema-constrained transcription. Returns raw text. */
  async transcribeAudio(opts: {
    model: string;
    prompt: string;
    audio: Blob;
    mimeType: string;
    responseSchema: Schema;
    maxOutputTokens?: number;
  }): Promise<string> {
    const uploaded = await callExternal(
      { provider: 'gemini', operation: 'files.upload', retries: 1, timeoutMs: 300_000 },
      () => this.ai.files.upload({ file: opts.audio, config: { mimeType: opts.mimeType, displayName: 'remi-upload' } }),
    );
    const name = uploaded.name;
    if (!name) throw new UpstreamError('gemini', undefined, new Error('file upload returned no name'));
    try {
      let file = uploaded;
      const deadline = Date.now() + 10 * 60_000;
      while (file.state === FileState.PROCESSING && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        file = await callExternal({ provider: 'gemini', operation: 'files.get', retries: 2, timeoutMs: 20_000 }, () =>
          this.ai.files.get({ name }),
        );
      }
      if (file.state !== FileState.ACTIVE || !file.uri) {
        throw new UpstreamError(
          'gemini',
          'The AI service could not read this audio file.',
          new Error(`file state ${file.state}`),
          false,
        );
      }
      const uri = file.uri;
      const res = await callExternal(
        { provider: 'gemini', operation: 'transcribe', retries: 2, timeoutMs: 600_000, baseDelayMs: 2000 },
        (signal) =>
          this.ai.models.generateContent({
            model: opts.model,
            contents: createUserContent([createPartFromUri(uri, file.mimeType ?? opts.mimeType), opts.prompt]),
            config: {
              temperature: 0,
              maxOutputTokens: opts.maxOutputTokens,
              responseMimeType: 'application/json',
              responseSchema: opts.responseSchema,
              abortSignal: signal,
            },
          }),
      );
      return extractText(res).text;
    } finally {
      this.ai.files
        .delete({ name })
        .catch(() => this.logger.warn({ provider: 'gemini' }, 'could not delete uploaded file'));
    }
  }
}

export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
    if (fenced) return JSON.parse(fenced[1]);
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new SyntaxError('Model output is not valid JSON');
  }
}

export function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
}

/**
 * Deterministic bag-of-words hashing embedding for AI_MOCK mode: texts sharing words get similar
 * vectors, so retrieval behaves plausibly without an API key.
 */
export function mockEmbedding(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) {
      h ^= w.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % EMBEDDING_DIMENSIONS;
    v[idx] += 1;
    v[(idx * 7 + 3) % EMBEDDING_DIMENSIONS] += 0.5;
  }
  if (!words.length) v[0] = 1;
  return normalize(v);
}
