import type { ErrorCode, ValidationDetail } from './types';

export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'PARSE_ERROR';

/** Typed error thrown by every API call. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly details: unknown;
  /** Server request id (body `requestId` or the `X-Request-Id` header). */
  readonly requestId?: string;
  /** Seconds until a RATE_LIMITED request may be retried (from `Retry-After`). */
  readonly retryAfterSeconds?: number;

  constructor(init: {
    status: number;
    code: ClientErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
    retryAfterSeconds?: number;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }

  /** `details` for VALIDATION_ERROR as `{ field, messages }[]` (field is a dot path). */
  get validationDetails(): ValidationDetail[] {
    if (!Array.isArray(this.details)) return [];
    return this.details.filter(
      (d): d is ValidationDetail =>
        typeof d === 'object' &&
        d !== null &&
        typeof (d as ValidationDetail).field === 'string' &&
        Array.isArray((d as ValidationDetail).messages),
    );
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Parse a `Retry-After` header (delta-seconds or HTTP date) into seconds. */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

/** "45 seconds", "3 minutes", "about 2 hours". */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hour${hours === 1 ? '' : 's'}`;
}

/** Server errors (5xx) and unreadable responses: the server text is never shown, only a reference. */
export function isUnexpectedError(error: unknown): boolean {
  if (!isApiError(error)) return true;
  return error.status >= 500 || error.code === 'PARSE_ERROR' || error.code === 'INTERNAL_ERROR';
}

export function isForbidden(error: unknown): boolean {
  return isApiError(error) && error.code === 'FORBIDDEN';
}

export type ErrorAction = 'upload' | 'login' | 'load' | 'save';

const GENERIC = 'Something went wrong on our side. Please try again.';

/**
 * The message to show for any error. 4xx API messages are written to be safe to show; 5xx responses only ever
 * produce generic text (pair with `getErrorReference` for the support reference).
 */
export function getErrorMessage(error: unknown, options?: { action?: ErrorAction; fallback?: string }): string {
  const action = options?.action;
  if (!isApiError(error)) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'The request was cancelled.';
    return options?.fallback ?? GENERIC;
  }
  switch (error.code) {
    case 'NETWORK_ERROR':
      return error.message;
    case 'PARSE_ERROR':
      return 'The server sent a response the admin panel could not read. Please try again.';
    case 'UPSTREAM_ERROR':
      return 'The external service failed (Google, Gemini or Cloudinary). Please try again in a moment.';
    case 'PAYLOAD_TOO_LARGE':
      return action === 'upload' ? 'This file is too large. Images must be 10 MB or smaller.' : 'The request is too large.';
    case 'UNSUPPORTED_MEDIA_TYPE':
      return action === 'upload'
        ? 'This file type is not supported. Upload a PNG, JPG, WebP, SVG, GIF or ICO image.'
        : 'This content type is not supported.';
    case 'RATE_LIMITED': {
      const wait = error.retryAfterSeconds;
      return wait !== undefined
        ? `Too many requests. Try again in ${formatRetryAfter(wait)}.`
        : 'Too many requests. Please wait a moment and try again.';
    }
    case 'FORBIDDEN':
      return "You don't have permission to do that.";
    case 'MAINTENANCE':
      return 'The service is in maintenance mode. Please try again shortly.';
    case 'VALIDATION_ERROR':
      return error.message || 'Some fields are invalid. Check the highlighted fields.';
    default:
      if (isUnexpectedError(error)) return GENERIC;
      return error.message || options?.fallback || GENERIC;
  }
}

/** A short reference for support. Only for unexpected errors (5xx / unreadable responses), else null. */
export function getErrorReference(error: unknown): string | null {
  if (isApiError(error)) return isUnexpectedError(error) ? (error.requestId ?? null) : null;
  if (error && typeof error === 'object' && typeof (error as { digest?: unknown }).digest === 'string') {
    return (error as { digest: string }).digest;
  }
  return null;
}

const handledErrors = new WeakSet<object>();

/**
 * Mark an error as shown to the user locally (inline in a dialog, or fully mapped onto form fields), so the
 * global mutation toast skips it. The global handler defers its toast by a tick to give callers this chance.
 */
export function markErrorHandled(error: unknown): void {
  if (error && typeof error === 'object') handledErrors.add(error);
}

export function isErrorHandled(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && handledErrors.has(error));
}
