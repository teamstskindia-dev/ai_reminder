import { API_BASE_URL } from '@/utils/env';

import { ApiError } from './errors';
import { maintenanceEvents, sessionExpiredEvents } from './events';
import { getAccessToken, getRefreshToken, setTokens } from './tokens';
import type { ApiErrorBody, AuthTokens, ErrorCode, Paginated, PaginationMeta, ValidationIssue } from './types';

type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: QueryParams;
  body?: unknown;
  /** Attach the Bearer token and refresh it on 401 (default true). */
  auth?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ApiResponse<T> {
  status: number;
  data: T;
  meta: PaginationMeta | undefined;
  headers: Headers;
}

/** Default request timeout; slow endpoints (Ask AI) pass a longer `timeoutMs`. */
const DEFAULT_TIMEOUT_MS = 15_000;

export function buildUrl(path: string, query?: QueryParams): string {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `${url}?${parts.join('&')}` : url;
}

function parseRetryAfter(headers: Headers): number | null {
  const raw = headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return seconds;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? null : Math.max(0, Math.round((date - Date.now()) / 1000));
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { success?: unknown }).success === false &&
    typeof (value as { error?: unknown }).error === 'object'
  );
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ValidationIssue).field === 'string' &&
    Array.isArray((value as ValidationIssue).messages)
  );
}

function fallbackCode(status: number): ErrorCode {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 415) return 'UNSUPPORTED_MEDIA_TYPE';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 502) return 'UPSTREAM_ERROR';
  if (status === 503) return 'MAINTENANCE';
  return 'INTERNAL_ERROR';
}

/** One HTTP round trip. No refresh logic here. */
async function send<T>(path: string, options: RequestOptions, accessToken: string | null): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort);

  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (cause) {
    const aborted = controller.signal.aborted && !options.signal?.aborted;
    throw new ApiError({
      code: aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
      status: 0,
      message: cause instanceof Error ? cause.message : 'Network request failed',
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  if (response.status === 204 || response.status === 304) {
    return { status: response.status, data: undefined as T, meta: undefined, headers: response.headers };
  }

  const text = await response.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }

  if (!response.ok) {
    const body = isErrorBody(json) ? json : null;
    const details = body?.error.details;
    const error = new ApiError({
      code: body?.error.code ?? fallbackCode(response.status),
      status: response.status,
      message: body?.error.message ?? `Request failed (${response.status})`,
      details: Array.isArray(details) ? details.filter(isValidationIssue) : [],
      retryAfterSeconds: parseRetryAfter(response.headers),
      requestId: body?.requestId ?? response.headers.get('x-request-id'),
    });
    if (error.code === 'MAINTENANCE') maintenanceEvents.emit({ message: body?.error.message ?? null });
    throw error;
  }

  if (typeof json === 'object' && json !== null && 'success' in json && 'data' in json) {
    const envelope = json as { data: T; meta?: PaginationMeta };
    return { status: response.status, data: envelope.data, meta: envelope.meta, headers: response.headers };
  }
  // Endpoints without the envelope (e.g. /health) pass through unchanged.
  return { status: response.status, data: json as T, meta: undefined, headers: response.headers };
}

// ---------- Single-flight refresh ----------
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Exchanges the stored refresh token for new tokens. Concurrent callers share one request.
 * Resolves to the new access token, or null when the session is no longer valid.
 * Network failures reject (the session may still be fine once we're back online).
 */
export function refreshSession(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return null;
      try {
        const res = await send<{ tokens: AuthTokens }>(
          '/auth/refresh',
          { method: 'POST', body: { refreshToken }, auth: false },
          null,
        );
        await setTokens(res.data.tokens);
        return res.data.tokens.accessToken;
      } catch (error) {
        if (error instanceof ApiError && !error.isNetwork && error.code !== 'MAINTENANCE' && error.status < 500) {
          return null;
        }
        throw error;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Full request with envelope unwrap, Bearer auth and one refresh-and-retry on 401. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const useAuth = options.auth !== false;
  const token = useAuth ? await getAccessToken() : null;
  try {
    return await send<T>(path, options, token);
  } catch (error) {
    if (!useAuth || !(error instanceof ApiError) || error.status !== 401) throw error;

    // Another request may already have rotated the token while this one was in flight.
    const current = await getAccessToken();
    let nextToken: string | null;
    if (current && current !== token) {
      nextToken = current;
    } else {
      nextToken = await refreshSession();
    }
    if (!nextToken) {
      sessionExpiredEvents.emit({ reason: 'refresh_failed' });
      throw error;
    }
    return send<T>(path, options, nextToken);
  }
}

export async function api<T>(path: string, options?: RequestOptions): Promise<T> {
  return (await apiRequest<T>(path, options)).data;
}

export async function apiPage<T>(path: string, options?: RequestOptions): Promise<Paginated<T>> {
  const res = await apiRequest<T[]>(path, options);
  const items = res.data ?? [];
  return {
    items,
    meta: res.meta ?? { page: 1, limit: items.length, total: items.length, totalPages: 1 },
  };
}
