import { HttpException } from '@nestjs/common';
import type { ErrorCode } from '../types/api.types';

export interface ValidationIssue {
  field: string;
  messages: string[];
}

/** HTTP status for every contract error code (API contract §0). */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  PLAN_LIMIT_REACHED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  // 503, not 502: Cloudflare (in front of api.leogix.io) replaces origin 502/504 responses with its own HTML page,
  // which has no CORS headers — browsers would see a network error instead of this JSON error. Clients tell it
  // apart from MAINTENANCE (also 503) by `error.code`.
  UPSTREAM_ERROR: 503,
  MAINTENANCE: 503,
};

export interface AppExceptionBody {
  code: ErrorCode;
  message: string;
  details?: ValidationIssue[];
}

/**
 * Typed domain error carrying a contract error code. `message` is always safe to show to end users;
 * internal context goes into `cause` (logged, never returned).
 */
export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly details?: ValidationIssue[];
  /** Extra response headers (e.g. Retry-After). */
  readonly headers: Record<string, string> = {};

  constructor(
    code: ErrorCode,
    message: string,
    status: number = ERROR_STATUS[code],
    details?: ValidationIssue[],
    cause?: unknown,
  ) {
    super({ code, message, details } satisfies AppExceptionBody, status, cause === undefined ? undefined : { cause });
    this.code = code;
    this.details = details;
    this.name = new.target.name;
  }

  // ---- convenience factories (each returns the matching subclass) ----
  static badRequest(message: string, cause?: unknown) {
    return new BadRequestError(message, cause);
  }
  static validation(details: ValidationIssue[], message = 'Validation failed') {
    return new ValidationError(details, message);
  }
  static unauthorized(message = 'Authentication required') {
    return new UnauthorizedError(message);
  }
  static tokenExpired() {
    return new TokenExpiredError();
  }
  static forbidden(message = 'You do not have permission to do this') {
    return new ForbiddenError(message);
  }
  static planLimit(message: string) {
    return new PlanLimitReachedError(message);
  }
  static notFound(what = 'Resource') {
    return new NotFoundError(what);
  }
  static conflict(message: string, cause?: unknown) {
    return new ConflictError(message, cause);
  }
  static payloadTooLarge(message = 'Payload too large') {
    return new AppException('PAYLOAD_TOO_LARGE', message);
  }
  static unsupportedMedia(message = 'Unsupported file type') {
    return new AppException('UNSUPPORTED_MEDIA_TYPE', message);
  }
  static rateLimited(message: string, retryAfterSeconds: number) {
    return new RateLimitedError(message, retryAfterSeconds);
  }
  static upstream(provider: string, cause?: unknown, message?: string) {
    return new UpstreamError(provider, message, cause);
  }
  static maintenance(message: string) {
    return new AppException('MAINTENANCE', message);
  }
  static internal(message = 'Something went wrong', cause?: unknown) {
    return new InternalError(message, cause);
  }
}

export class BadRequestError extends AppException {
  constructor(message: string, cause?: unknown) {
    super('BAD_REQUEST', message, 400, undefined, cause);
  }
}

export class ValidationError extends AppException {
  constructor(details: ValidationIssue[], message = 'Validation failed') {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class UnauthorizedError extends AppException {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class TokenExpiredError extends AppException {
  constructor() {
    super('TOKEN_EXPIRED', 'Access token expired', 401);
  }
}

export class ForbiddenError extends AppException {
  constructor(message = 'You do not have permission to do this') {
    super('FORBIDDEN', message, 403);
  }
}

export class PlanLimitReachedError extends AppException {
  constructor(message: string) {
    super('PLAN_LIMIT_REACHED', message, 403);
  }
}

export class NotFoundError extends AppException {
  constructor(what = 'Resource') {
    super('NOT_FOUND', `${what} not found`, 404);
  }
}

export class ConflictError extends AppException {
  constructor(message: string, cause?: unknown) {
    super('CONFLICT', message, 409, undefined, cause);
  }
}

export class RateLimitedError extends AppException {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super('RATE_LIMITED', message, 429);
    this.headers['Retry-After'] = String(Math.max(1, Math.ceil(retryAfterSeconds)));
  }
}

/** A dependency (Google, Gemini, Cloudinary, Expo, SMTP, Storage) failed. Safe to retry. */
export class UpstreamError extends AppException {
  constructor(
    readonly provider: string,
    message?: string,
    cause?: unknown,
    readonly retryable = true,
  ) {
    super(
      'UPSTREAM_ERROR',
      message ?? `${providerLabel(provider)} is unavailable right now. Please try again.`,
      ERROR_STATUS.UPSTREAM_ERROR,
      undefined,
      cause,
    );
  }
}

export class InternalError extends AppException {
  constructor(message = 'Something went wrong', cause?: unknown) {
    super('INTERNAL_ERROR', message, 500, undefined, cause);
  }
}

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    google: 'Google',
    gemini: 'The AI service',
    cloudinary: 'The media service',
    expo: 'The push service',
    smtp: 'The email service',
    storage: 'File storage',
  };
  return labels[provider] ?? 'A dependency';
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

/** "Outer: inner: root" message chain following `cause`, for logs only. */
export function causeChain(err: unknown, max = 5): string[] {
  const out: string[] = [];
  let current: unknown = err;
  for (let i = 0; i < max && current; i++) {
    if (current instanceof Error) {
      out.push(`${current.name}: ${current.message}`);
      current = (current as { cause?: unknown }).cause;
    } else {
      out.push(typeof current === 'string' ? current : (JSON.stringify(current) ?? 'unknown'));
      break;
    }
  }
  return out;
}
