/**
 * Client logger and error-reporting hook.
 *
 * - `debug` / `info` only print in development.
 * - `warn` / `error` print everywhere, but only sanitised context.
 * - `reportError` is the single place errors leave the app. It is a no-op until a reporter is registered
 *   (e.g. `setErrorReporter((error, context) => Sentry.captureException(error, { extra: context }))`).
 *
 * Never pass tokens, passwords, cookies, emails, names or user content as context — keys that look sensitive
 * are redacted defensively, but callers should only send ids, codes and route names.
 */

export type LogValue = string | number | boolean | null | undefined;
export type LogContext = Record<string, LogValue>;

type ErrorReporter = (error: unknown, context: LogContext) => void;

const isDev = process.env.NODE_ENV !== 'production';
const SENSITIVE_KEY = /token|password|secret|authorization|cookie|^session$|email|^name$|phone|^content$|^body$|transcript|^q$|^search$/i;
const MAX_VALUE_LENGTH = 200;

let reporter: ErrorReporter | null = null;

/** Register the production error reporter (Sentry, Datadog…). Pass `null` to disable. */
export function setErrorReporter(next: ErrorReporter | null): void {
  reporter = next;
}

function sanitize(context?: LogContext): LogContext {
  if (!context) return {};
  const clean: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEY.test(key)) {
      clean[key] = '[redacted]';
    } else if (typeof value === 'string' && value.length > MAX_VALUE_LENGTH) {
      clean[key] = `${value.slice(0, MAX_VALUE_LENGTH)}…`;
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

interface ErrorLike {
  name?: unknown;
  code?: unknown;
  status?: unknown;
  requestId?: unknown;
  digest?: unknown;
  message?: unknown;
}

/**
 * Describe an error without personal data. API errors are reduced to code/status/requestId (their message may
 * echo user input); other errors keep name + message, which come from code.
 */
export function describeError(error: unknown): LogContext {
  if (error === null || typeof error !== 'object') return { error: String(error).slice(0, MAX_VALUE_LENGTH) };
  const e = error as ErrorLike;
  if (e.name === 'ApiError') {
    return {
      errorName: 'ApiError',
      code: typeof e.code === 'string' ? e.code : undefined,
      status: typeof e.status === 'number' ? e.status : undefined,
      requestId: typeof e.requestId === 'string' ? e.requestId : undefined,
    };
  }
  return {
    errorName: typeof e.name === 'string' ? e.name : 'Error',
    message: typeof e.message === 'string' ? e.message.slice(0, MAX_VALUE_LENGTH) : undefined,
    digest: typeof e.digest === 'string' ? e.digest : undefined,
  };
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (isDev) console.debug(`[remi-admin] ${message}`, sanitize(context));
  },
  info(message: string, context?: LogContext): void {
    if (isDev) console.info(`[remi-admin] ${message}`, sanitize(context));
  },
  warn(message: string, context?: LogContext): void {
    console.warn(`[remi-admin] ${message}`, sanitize(context));
  },
  error(message: string, context?: LogContext): void {
    console.error(`[remi-admin] ${message}`, sanitize(context));
  },
};

/** Report an error to the registered reporter (and the console in development). Never throws. */
export function reportError(error: unknown, context?: LogContext): void {
  const payload = { ...describeError(error), ...sanitize(context) };
  try {
    if (isDev) console.error('[remi-admin] reportError', payload, error);
    reporter?.(error, payload);
  } catch {
    // Reporting must never break the app.
  }
}
