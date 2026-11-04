import { logger } from '@/lib/logger';

import { ApiError, getErrorMessage, isApiError, parseRetryAfter, type ClientErrorCode } from './errors';
import type { ApiErrorBody, ApiSuccess, Paginated, PaginationMeta } from './types';

export { ApiError, getErrorMessage, isApiError };
export type { ClientErrorCode };

/**
 * Same-origin mode (NEXT_PUBLIC_API_PROXY=true): the browser calls /api/v1 on the admin's own domain and the admin's
 * server forwards it to API_PROXY_TARGET (rewrites in next.config.ts). The API's auth cookies then belong to the
 * admin's domain, which is where the route guard (src/proxy.ts) looks for them. Required whenever the admin and the
 * API don't share a parent domain, e.g. *.vercel.app.
 */
const SAME_ORIGIN = process.env.NEXT_PUBLIC_API_PROXY === 'true';

export const API_URL = SAME_ORIGIN ? '' : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
export const API_BASE = `${API_URL}/api/v1`;

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
  /** Skip the refresh-and-retry dance (used by the auth endpoints themselves). */
  skipAuthRetry?: boolean;
}

interface Envelope<T> {
  data: T;
  meta?: PaginationMeta;
}

/** Never refresh in response to these (contract §0 Authentication). */
const AUTH_PATHS = ['/admin/auth/login', '/admin/auth/refresh', '/admin/auth/logout'];

let refreshPromise: Promise<boolean> | null = null;
let redirecting = false;
let sessionExpiredHandler: (() => void) | null = null;

/** Called once before redirecting to /login after a failed refresh (the app clears its query cache here). */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

/** One in-flight refresh shared by every concurrent caller. */
function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    logger.debug('refreshing admin session');
    refreshPromise = fetch(`${API_BASE}/admin/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
      cache: 'no-store',
    })
      .then((res) => {
        if (!res.ok) logger.warn('admin session refresh failed', { status: res.status });
        return res.ok;
      })
      .catch(() => {
        logger.warn('admin session refresh failed', { status: 0 });
        return false;
      })
      .finally(() => {
        // Allow a future refresh once this one has settled.
        setTimeout(() => {
          refreshPromise = null;
        }, 0);
      });
  }
  return refreshPromise;
}

/** Full page load to /login (drops every in-memory secret and cached response). */
export function redirectToLogin(): void {
  if (typeof window === 'undefined' || redirecting) return;
  const { pathname, search } = window.location;
  if (pathname.startsWith('/login')) return;
  redirecting = true;
  try {
    sessionExpiredHandler?.();
  } catch {
    // never block the redirect
  }
  const target = new URL('/login', window.location.origin);
  target.searchParams.set('next', `${pathname}${search}`);
  window.location.replace(target.toString());
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', query, body, signal } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  try {
    return await fetch(`${API_BASE}${path}${buildQuery(query)}`, {
      method,
      headers,
      body: payload,
      credentials: 'include',
      signal,
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: `Cannot reach the API${API_URL ? ` at ${API_URL}` : ''}. Check your connection or whether the backend is running.`,
    });
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await res.json()) as Partial<ApiErrorBody>;
  } catch {
    body = null;
  }
  const err = body?.error;
  const code: ClientErrorCode =
    err?.code ??
    (res.status === 401
      ? 'UNAUTHORIZED'
      : res.status === 403
        ? 'FORBIDDEN'
        : res.status === 404
          ? 'NOT_FOUND'
          : res.status === 413
            ? 'PAYLOAD_TOO_LARGE'
            : res.status === 415
              ? 'UNSUPPORTED_MEDIA_TYPE'
              : res.status === 429
                ? 'RATE_LIMITED'
                : res.status === 502
                  ? 'UPSTREAM_ERROR'
                  : res.status >= 500
                    ? 'INTERNAL_ERROR'
                    : 'BAD_REQUEST');
  return new ApiError({
    status: res.status,
    code,
    message: typeof err?.message === 'string' ? err.message : `Request failed with status ${res.status}`,
    details: err?.details,
    requestId: body?.requestId ?? res.headers.get('X-Request-Id') ?? undefined,
    retryAfterSeconds: parseRetryAfter(res.headers.get('Retry-After')),
  });
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<Envelope<T>> {
  let res = await send(path, options);

  const isAuthPath = AUTH_PATHS.some((p) => path.startsWith(p));
  if (res.status === 401 && !isAuthPath && !options.skipAuthRetry) {
    const error = await parseError(res.clone());
    // Cookie clients refresh on TOKEN_EXPIRED and UNAUTHORIZED (the browser drops the expired access cookie).
    if (error.code === 'TOKEN_EXPIRED' || error.code === 'UNAUTHORIZED') {
      const refreshed = await refreshSession();
      if (refreshed) {
        res = await send(path, options); // retried once; a 401 here is never refreshed again
      }
      if (!refreshed || res.status === 401) {
        logger.info('admin session expired, redirecting to login');
        redirectToLogin();
        throw refreshed ? await parseError(res) : error;
      }
    }
  }

  if (res.status === 204) {
    return { data: undefined as T };
  }
  if (!res.ok) {
    throw await parseError(res);
  }

  let json: ApiSuccess<T>;
  try {
    json = (await res.json()) as ApiSuccess<T>;
  } catch {
    throw new ApiError({
      status: res.status,
      code: 'PARSE_ERROR',
      message: 'The API returned an invalid response',
      requestId: res.headers.get('X-Request-Id') ?? undefined,
    });
  }
  return { data: json.data, meta: json.meta };
}

export const api = {
  async get<T>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<T> {
    return (await request<T>(path, { query, signal })).data;
  },
  async list<T>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<Paginated<T>> {
    const { data, meta } = await request<T[]>(path, { query, signal });
    const items = Array.isArray(data) ? data : [];
    return {
      items,
      meta: meta ?? { page: 1, limit: items.length, total: items.length, totalPages: 1 },
    };
  },
  async post<T>(path: string, body?: unknown, opts?: Pick<RequestOptions, 'skipAuthRetry'>): Promise<T> {
    return (await request<T>(path, { method: 'POST', body: body ?? {}, ...opts })).data;
  },
  async put<T>(path: string, body: unknown): Promise<T> {
    return (await request<T>(path, { method: 'PUT', body })).data;
  },
  async patch<T>(path: string, body: unknown): Promise<T> {
    return (await request<T>(path, { method: 'PATCH', body })).data;
  },
  async delete(path: string): Promise<void> {
    await request<void>(path, { method: 'DELETE' });
  },
};
