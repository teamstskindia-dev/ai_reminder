/**
 * Tiny logger shared by server and client code.
 *
 * - `debug` / `info` only print in development; `warn` / `error` always print.
 * - Context is sanitised: only primitive values are kept, keys that may carry secrets or personal
 *   content are dropped, and token-like strings are redacted. Never pass request bodies, cookies,
 *   transcripts or other user content.
 * - `reportError` is the single hook point for an error tracker (e.g. Sentry); it is a no-op for now.
 */

type Level = "debug" | "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

const isDev = process.env.NODE_ENV !== "production";

const BLOCKED_KEYS = /token|secret|password|passwd|cookie|authorization|auth|session|body|content|transcript|email|name|phone|address|code/i;
const ALWAYS_ALLOWED = new Set(["requestId", "errorCode", "errorName", "errorMessage", "digest", "where"]);
const TOKEN_LIKE = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b[A-Fa-f0-9]{32,}\b/g, // long hex
  /\b[A-Za-z0-9_-]{40,}\b/g, // long opaque / base64url
  /([?&](?:code|token|access_token|refresh_token|key|secret)=)[^&\s]+/gi,
];

export function redact(value: string): string {
  let out = value;
  for (const pattern of TOKEN_LIKE) {
    out = out.replace(pattern, (match, prefix?: string) => (typeof prefix === "string" && match.startsWith(prefix) ? `${prefix}[redacted]` : "[redacted]"));
  }
  return out.length > 500 ? `${out.slice(0, 500)}…` : out;
}

function sanitize(context: LogContext | undefined): Record<string, string | number | boolean | null> | undefined {
  if (!context) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!ALWAYS_ALLOWED.has(key) && BLOCKED_KEYS.test(key)) continue;
    if (value === null || typeof value === "number" || typeof value === "boolean") out[key] = value;
    else if (typeof value === "string") out[key] = redact(value);
  }
  return out;
}

/** Describe an error without leaking payloads: name, code/status, request id and a redacted message. */
export function describeError(error: unknown): LogContext {
  if (error && typeof error === "object") {
    const e = error as { name?: unknown; message?: unknown; code?: unknown; status?: unknown; requestId?: unknown; digest?: unknown };
    return {
      errorName: typeof e.name === "string" ? e.name : "Error",
      errorCode: typeof e.code === "string" ? e.code : undefined,
      status: typeof e.status === "number" ? e.status : undefined,
      requestId: typeof e.requestId === "string" ? e.requestId : undefined,
      digest: typeof e.digest === "string" ? e.digest : undefined,
      errorMessage: typeof e.message === "string" ? redact(e.message) : undefined,
    };
  }
  return { errorMessage: redact(String(error)) };
}

function emit(level: Level, message: string, context?: LogContext) {
  if ((level === "debug" || level === "info") && !isDev) return;
  const clean = sanitize(context);
  const line = `[remi] ${redact(message)}`;
  const fn = level === "debug" ? console.debug : level === "info" ? console.info : level === "warn" ? console.warn : console.error;
  if (clean && Object.keys(clean).length) fn(line, clean);
  else fn(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};

/** Hook point for an error-tracking service. Logs locally; wire Sentry (or similar) here later. */
export function reportError(error: unknown, context: LogContext = {}) {
  logger.error(typeof context.where === "string" ? `error in ${context.where}` : "unexpected error", {
    ...context,
    ...describeError(error),
  });
  // Intentionally a no-op beyond logging for now: e.g. Sentry.captureException(error, { extra: context }).
}
