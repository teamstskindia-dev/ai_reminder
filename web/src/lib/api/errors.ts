import type { ApiErrorBody, ClientErrorCode, ErrorCode, ValidationIssue } from "./types";

export type AnyErrorCode = ErrorCode | ClientErrorCode;

/** Typed error thrown by the API client for every non-2xx response or network failure. */
export class ApiError extends Error {
  readonly code: AnyErrorCode;
  readonly status: number;
  readonly details: ValidationIssue[] | undefined;
  readonly requestId: string | undefined;
  readonly retryAfter: number | undefined;

  constructor(opts: {
    code: AnyErrorCode;
    status: number;
    message: string;
    details?: ValidationIssue[];
    requestId?: string;
    retryAfter?: number;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
    this.requestId = opts.requestId;
    this.retryAfter = opts.retryAfter;
  }

  static fromBody(body: ApiErrorBody, status: number, extra: { retryAfter?: number; requestId?: string } = {}): ApiError {
    return new ApiError({
      code: body.error?.code ?? "UNKNOWN",
      status: body.statusCode ?? status,
      message: body.error?.message || "Something went wrong",
      details: Array.isArray(body.error?.details) ? body.error.details : undefined,
      requestId: body.requestId || extra.requestId,
      retryAfter: extra.retryAfter,
    });
  }

  /** Validation issues (`VALIDATION_ERROR` only), in the contract's `{ field, messages[] }[]` shape. */
  get fieldErrors(): ValidationIssue[] {
    return (this.details ?? []).filter((d) => d && typeof d.field === "string" && Array.isArray(d.messages));
  }

  /** Unexpected server-side failure: show generic copy and the reference id, never the raw message. */
  get isServerError(): boolean {
    return this.status >= 500 && this.code !== "MAINTENANCE" && this.code !== "UPSTREAM_ERROR";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { success?: unknown }).success === false &&
    typeof (value as { error?: unknown }).error === "object"
  );
}

export interface ErrorInfo {
  /** Friendly, safe-to-show message. */
  message: string;
  /** Request id to quote to support (shown for unexpected errors). */
  reference?: string;
  /** Optional follow-up action (e.g. upgrade link for plan limits). */
  action?: { label: string; href: string };
}

const GENERIC = "Something went wrong. Please try again.";

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Maps any thrown value to friendly copy. Raw server text is never shown for 5xx errors. */
export function getErrorInfo(error: unknown, fallback = GENERIC): ErrorInfo {
  if (isApiError(error)) {
    switch (error.code) {
      case "NETWORK_ERROR":
        return {
          message: isOffline()
            ? "You're offline. Check your internet connection and try again."
            : "We couldn't reach the server. Check your connection and try again.",
        };
      case "RATE_LIMITED":
        return {
          message: error.retryAfter
            ? `You're going a little fast. Try again in ${error.retryAfter} second${error.retryAfter === 1 ? "" : "s"}.`
            : "You're going a little fast. Please wait a moment and try again.",
        };
      case "PLAN_LIMIT_REACHED":
        return {
          message: error.message || "You've reached a limit on your current plan.",
          action: { label: "See plans", href: "/pricing" },
        };
      case "UPSTREAM_ERROR":
        return {
          message: "A service we depend on didn't respond. Please try again in a moment.",
          reference: error.requestId,
        };
      case "MAINTENANCE":
        return { message: "We're doing some maintenance. Please try again in a few minutes." };
      case "PAYLOAD_TOO_LARGE":
        return { message: "That file is too large. Audio can be up to 200 MB and transcripts up to 5 MB." };
      case "UNSUPPORTED_MEDIA_TYPE":
        return { message: "That file type isn't supported. Use mp3, m4a, wav, webm or ogg audio, or a txt, vtt or srt transcript." };
      case "VALIDATION_ERROR": {
        const first = error.fieldErrors[0];
        return { message: first?.messages[0] ? `${first.messages[0]}` : error.message || "Please check the form and try again." };
      }
      case "UNAUTHORIZED":
      case "TOKEN_EXPIRED":
        return { message: "Your session has expired. Please sign in again." };
      case "NOT_FOUND":
        return { message: error.message || "We couldn't find that. It may have been deleted." };
      default:
        if (error.isServerError || error.code === "UNKNOWN") {
          return { message: GENERIC, reference: error.requestId };
        }
        return { message: error.message || fallback, reference: error.status >= 500 ? error.requestId : undefined };
    }
  }
  if (error && typeof error === "object" && typeof (error as { digest?: unknown }).digest === "string") {
    return { message: fallback, reference: (error as { digest: string }).digest };
  }
  return { message: fallback };
}

/** One-line friendly message (includes "Reference: …" for unexpected server errors). */
export function getErrorMessage(error: unknown, fallback = GENERIC): string {
  const info = getErrorInfo(error, fallback);
  return info.reference ? `${info.message} Reference: ${info.reference}` : info.message;
}
