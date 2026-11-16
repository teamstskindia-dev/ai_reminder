import { Logger } from '@nestjs/common';
import { AppException, UpstreamError } from '../../common/errors/app.exception';

export type Provider =
  'google' | 'apple' | 'gemini' | 'cloudinary' | 'expo' | 'smtp' | 'storage' | 'webhook' | 'recall';

export interface ExternalCallOptions {
  provider: Provider;
  operation: string;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Extra attempts after the first (only for retryable failures). Use 0 for non-idempotent calls. */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Override the default retryability check. */
  isRetryable?: (err: unknown) => boolean;
  /** Errors that should be re-thrown as-is (e.g. domain errors like invalid_grant). */
  passThrough?: (err: unknown) => boolean;
}

const logger = new Logger('ExternalCall');

const RETRYABLE_NET_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ESOCKETTIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
]);

/** HTTP status of a provider error, from the common shapes (gaxios, fetch, genai, cloudinary). */
export function errorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as {
    status?: unknown;
    statusCode?: unknown;
    http_code?: unknown;
    code?: unknown;
    response?: { status?: unknown };
    error?: { http_code?: unknown };
  };
  for (const v of [e.status, e.statusCode, e.http_code, e.response?.status, e.error?.http_code, e.code]) {
    if (typeof v === 'number' && v >= 100 && v < 600) return v;
    if (typeof v === 'string' && /^\d{3}$/.test(v)) return Number(v);
  }
  return undefined;
}

export function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if (err instanceof AppException && !(err instanceof UpstreamError)) return false;
  const e = err as { code?: unknown; name?: string; cause?: unknown };
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  if (typeof e.code === 'string' && RETRYABLE_NET_CODES.has(e.code)) return true;
  const status = errorStatus(err);
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;
  if (e.cause && e.cause !== err) return isRetryableError(e.cause);
  return err instanceof TypeError && /fetch failed|network/i.test(err.message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Full-jitter exponential backoff. */
export function backoffDelay(attempt: number, base: number, max: number): number {
  return Math.round(Math.random() * Math.min(max, base * 2 ** (attempt - 1)));
}

function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Timed out after ${timeoutMs}ms`);
      err.name = 'TimeoutError';
      controller.abort(err);
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([fn(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Runs a call to an external provider with a timeout, bounded jittered retries for retryable
 * failures (network, 408/429, 5xx) and mapping of the final failure to UPSTREAM_ERROR.
 * Logs provider, operation, latency, status and attempt; never arguments, tokens or bodies.
 */
export async function callExternal<T>(opts: ExternalCallOptions, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 300;
  const max = opts.maxDelayMs ?? 5_000;
  const retryable = opts.isRetryable ?? isRetryableError;

  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    try {
      const result = await withTimeout(fn, timeoutMs);
      logger.debug(
        { provider: opts.provider, operation: opts.operation, attempt, latencyMs: Date.now() - started },
        'external call ok',
      );
      return result;
    } catch (err) {
      const latencyMs = Date.now() - started;
      const status = errorStatus(err);
      const fields = {
        provider: opts.provider,
        operation: opts.operation,
        attempt,
        latencyMs,
        status,
        errName: (err as Error)?.name,
      };
      if (opts.passThrough?.(err)) throw err;
      const canRetry = attempt <= retries && retryable(err);
      if (canRetry) {
        const delay = backoffDelay(attempt, base, max);
        logger.warn({ ...fields, retryInMs: delay }, 'external call failed; retrying');
        await sleep(delay);
        continue;
      }
      logger.error(fields, 'external call failed');
      if (err instanceof AppException) throw err;
      throw new UpstreamError(opts.provider, undefined, err, retryable(err));
    }
  }
}
