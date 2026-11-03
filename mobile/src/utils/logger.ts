/**
 * App logger. Debug/info output exists only in development builds; release builds stay silent except
 * for `reportError`, which forwards to a pluggable reporter (no-op today, Sentry-ready).
 *
 * Never pass tokens, auth codes, PKCE verifiers, transcripts or other personal content. As a safety net,
 * context objects are redacted by key before they are printed or reported.
 */

export type LogContext = Record<string, unknown>;
export type ErrorReporter = (error: unknown, context: LogContext) => void;

const SENSITIVE_KEY =
  /token|secret|password|authorization|cookie|verifier|challenge|code$|^code|otc|transcript|content|body|snippet|question|answer|email|name$|summary/i;

let reporter: ErrorReporter = () => undefined;

/** Plug in a crash reporter, e.g. `setErrorReporter((e, ctx) => Sentry.captureException(e, { extra: ctx }))`. */
export function setErrorReporter(next: ErrorReporter): void {
  reporter = next;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: LogContext = {};
    for (const [key, child] of Object.entries(value as LogContext)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(child, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 200) return `${value.slice(0, 200)}…`;
  return value;
}

/** A safe, structured description of an error (no response bodies, no stack in release). */
export function describeError(error: unknown): LogContext {
  if (error && typeof error === 'object') {
    const e = error as { name?: unknown; message?: unknown; code?: unknown; status?: unknown; requestId?: unknown };
    return {
      name: typeof e.name === 'string' ? e.name : 'Error',
      code: e.code,
      status: e.status,
      requestId: e.requestId,
      message: typeof e.message === 'string' ? e.message.slice(0, 300) : undefined,
    };
  }
  return { message: String(error).slice(0, 300) };
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (__DEV__) console.log(`[remi] ${message}`, context ? redact(context) : '');
  },
  info(message: string, context?: LogContext): void {
    if (__DEV__) console.info(`[remi] ${message}`, context ? redact(context) : '');
  },
  warn(message: string, context?: LogContext): void {
    if (__DEV__) console.warn(`[remi] ${message}`, context ? redact(context) : '');
  },
};

/**
 * The single error-reporting hook: used by error boundaries, the query caches, the auth flow, push
 * registration and the config bootstrap. Never throws.
 */
export function reportError(error: unknown, context: LogContext = {}): void {
  const safeContext = redact(context) as LogContext;
  if (__DEV__) console.warn('[remi] reportError', describeError(error), safeContext);
  try {
    reporter(error, { ...safeContext, error: describeError(error) });
  } catch {
    // A broken reporter must never break the app.
  }
}
