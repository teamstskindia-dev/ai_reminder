import { onlineManager } from '@tanstack/react-query';

import type { ErrorCode, ValidationIssue } from './types';

export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'TIMEOUT' | 'UNKNOWN';

export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly details: ValidationIssue[];
  readonly retryAfterSeconds: number | null;
  /** Server request id (contract: always present on API errors; also the X-Request-Id header). */
  readonly requestId: string | null;

  constructor(init: {
    code: ClientErrorCode;
    status: number;
    message: string;
    details?: ValidationIssue[];
    retryAfterSeconds?: number | null;
    requestId?: string | null;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.details = init.details ?? [];
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
    this.requestId = init.requestId ?? null;
  }

  get isNetwork(): boolean {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }

  /** 5xx / unexpected: show generic copy plus the reference id, never the raw server text. */
  get isServerError(): boolean {
    return this.status >= 500 || this.code === 'INTERNAL_ERROR' || this.code === 'UNKNOWN';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  return `${Math.ceil(seconds / 60)} min`;
}

function withRef(text: string, requestId: string | null): string {
  return requestId ? `${text} Ref: ${requestId}` : text;
}

const GENERIC = 'Something went wrong. Please try again.';

/**
 * The one mapping from any thrown value to user-facing copy. 4xx messages from the API are safe to show
 * (contract §0); 5xx never show server text, only a generic line plus "Ref: {requestId}".
 */
export function getErrorMessage(error: unknown, fallback = GENERIC): string {
  if (!isApiError(error)) return fallback;
  switch (error.code) {
    case 'NETWORK_ERROR':
      return onlineManager.isOnline()
        ? "Can't reach the server. Please try again in a moment."
        : "You're offline. Check your connection and try again.";
    case 'TIMEOUT':
      return 'The server took too long to respond. Please try again.';
    case 'RATE_LIMITED':
      return error.retryAfterSeconds
        ? `You're going a bit fast. Try again in ${formatWait(error.retryAfterSeconds)}.`
        : "You're going a bit fast. Please wait a moment and try again.";
    case 'PLAN_LIMIT_REACHED':
      return error.message || "You've reached your plan's limit. Upgrade to keep going.";
    case 'UPSTREAM_ERROR':
      return withRef('A service we rely on is having trouble. Please try again shortly.', error.requestId);
    case 'MAINTENANCE':
      return "We're doing some maintenance. Please try again shortly.";
    case 'VALIDATION_ERROR':
      return error.details[0]?.messages[0] ?? (error.message || fallback);
    case 'UNSUPPORTED_MEDIA_TYPE':
      return error.message || "That file type isn't supported.";
    default:
      if (error.isServerError) return withRef(fallback === GENERIC ? GENERIC : fallback, error.requestId);
      return error.message || fallback;
  }
}

/** Contract VALIDATION_ERROR details as `{ field: firstMessage }` for forms. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error) || error.code !== 'VALIDATION_ERROR') return {};
  const out: Record<string, string> = {};
  for (const issue of error.details) {
    const message = issue.messages[0];
    if (!message) continue;
    // "items.2.title" → "title" so forms can match their own field names.
    out[issue.field] = message;
    const leaf = issue.field.split('.').pop();
    if (leaf && !(leaf in out)) out[leaf] = message;
  }
  return out;
}
