import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { AppConfig } from '../../config/app-config';
import { callExternal } from '../external/external-call';
import {
  RecallBot,
  recallBotSchema,
  RecallCreateBotRequest,
  RecallTranscript,
  recallTranscriptSchema,
} from './recall.types';

/** A non-2xx answer from Recall.ai. `detail` is a short, user-safe summary of the error body (never logged raw). */
export class RecallHttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string | null,
  ) {
    super(`Recall.ai responded ${status}`);
    this.name = 'RecallHttpError';
  }
}

/** The RecallHttpError behind an error (callExternal wraps final failures in UpstreamError), if any. */
export function recallHttpError(err: unknown): RecallHttpError | null {
  for (let e: unknown = err, depth = 0; e && depth < 5; depth++) {
    if (e instanceof RecallHttpError) return e;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

const MAX_TRANSCRIPT_BYTES = 50 * 1024 * 1024;
const BOT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Thin, typed client for Recall.ai's bot API (https://docs.recall.ai). Every call goes through callExternal
 * (timeouts, bounded retries, redacted logs). Creating a bot is never retried here: a timed-out create may
 * still have created a bot, so the caller decides (it retries only on 507 "no bots available" / 429).
 */
@Injectable()
export class RecallClient {
  constructor(private readonly config: AppConfig) {}

  get configured(): boolean {
    return this.config.recall.configured;
  }

  async createBot(body: RecallCreateBotRequest): Promise<RecallBot> {
    const json = await this.request('POST', '/api/v1/bot/', { body, operation: 'bot.create', retries: 0 });
    return this.parseBot(json);
  }

  async getBot(botId: string): Promise<RecallBot> {
    const json = await this.request('GET', `/api/v1/bot/${this.botId(botId)}/`, { operation: 'bot.retrieve' });
    return this.parseBot(json);
  }

  /** Asks the bot to leave the call (Recall.ai then sends call_ended → done as usual). */
  async leaveCall(botId: string): Promise<void> {
    await this.request('POST', `/api/v1/bot/${this.botId(botId)}/leave_call/`, { operation: 'bot.leave_call' });
  }

  /** Deletes the bot's recording, transcript and other media on Recall.ai's side. */
  async deleteMedia(botId: string): Promise<void> {
    await this.request('POST', `/api/v1/bot/${this.botId(botId)}/delete_media/`, { operation: 'bot.delete_media' });
  }

  /** True when the API key is accepted in the configured region (admin "Test connection"). */
  async verifyKey(): Promise<boolean> {
    try {
      await this.request('GET', '/api/v1/bot/?page_size=1', { operation: 'bot.list', retries: 0 });
      return true;
    } catch (err) {
      const status = recallHttpError(err)?.status;
      if (status === 401 || status === 403) return false;
      throw err;
    }
  }

  /** Downloads and validates a transcript from its (pre-signed) download URL. */
  async downloadTranscript(downloadUrl: string): Promise<RecallTranscript> {
    let url: URL;
    try {
      url = new URL(downloadUrl);
    } catch {
      throw AppException.upstream('recall', undefined, 'Recall.ai returned an invalid transcript URL');
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw AppException.upstream('recall', undefined, 'Recall.ai returned an invalid transcript URL');
    }
    // The API key only ever goes to Recall.ai's own API host, never to a storage host.
    const sameHost = url.host === new URL(this.config.recall.baseUrl).host;
    const json = await callExternal(
      { provider: 'recall', operation: 'transcript.download', timeoutMs: 60_000, retries: 2 },
      async (signal) => {
        const res = await fetch(url, {
          headers: sameHost ? this.headers() : { Accept: 'application/json' },
          signal,
          redirect: 'follow',
        });
        if (!res.ok) throw new RecallHttpError(res.status, null);
        return JSON.parse(await readLimited(res, MAX_TRANSCRIPT_BYTES)) as unknown;
      },
    );
    const parsed = recallTranscriptSchema.safeParse(json);
    if (!parsed.success) throw AppException.upstream('recall', undefined, 'Recall.ai returned a malformed transcript');
    return parsed.data;
  }

  private parseBot(json: unknown): RecallBot {
    const parsed = recallBotSchema.safeParse(json);
    if (!parsed.success) throw AppException.upstream('recall', undefined, 'Recall.ai returned an unexpected bot');
    return parsed.data;
  }

  private botId(botId: string): string {
    if (!BOT_ID_RE.test(botId)) throw AppException.badRequest('Invalid Recall.ai bot id');
    return botId;
  }

  private headers(): Record<string, string> {
    const { apiKey } = this.config.recall;
    if (!apiKey) throw AppException.upstream('recall', undefined, 'Recall.ai is not configured (RECALL_API_KEY)');
    return { Authorization: `Token ${apiKey}`, Accept: 'application/json' };
  }

  private request(
    method: 'GET' | 'POST',
    path: string,
    opts: { operation: string; body?: unknown; retries?: number },
  ): Promise<unknown> {
    const headers = this.headers();
    const url = `${this.config.recall.baseUrl}${path}`;
    return callExternal(
      { provider: 'recall', operation: opts.operation, timeoutMs: 20_000, retries: opts.retries ?? 2 },
      async (signal) => {
        const res = await fetch(url, {
          method,
          headers: opts.body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal,
          redirect: 'error',
        });
        const text = await readLimited(res, 2 * 1024 * 1024);
        if (!res.ok) throw new RecallHttpError(res.status, errorDetail(text));
        return text ? (JSON.parse(text) as unknown) : null;
      },
    );
  }
}

/** Reads a response body, refusing more than `max` bytes. */
async function readLimited(res: Response, max: number): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > max) throw AppException.upstream('recall', undefined, 'Recall.ai response is too large');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      throw AppException.upstream('recall', undefined, 'Recall.ai response is too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Short summary of a Recall.ai error body: `{"detail": "..."}` or the first field error such as
 * `{"meeting_url": ["..."]}`. Truncated; callers still sanitise it before it reaches a user.
 */
export function errorDetail(body: string): string | null {
  if (!body) return null;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  const pick = (v: unknown): string | null =>
    typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null;
  const detail = pick(obj.detail) ?? pick(obj.message);
  if (detail) return detail.slice(0, 200);
  for (const [key, value] of Object.entries(obj)) {
    const msg = pick(value);
    if (msg && /^[a-z_]{1,40}$/.test(key)) return `${key}: ${msg}`.slice(0, 200);
  }
  return null;
}
