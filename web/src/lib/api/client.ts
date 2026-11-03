import { API_BASE_URL } from "@/lib/env";
import { ApiError, isApiErrorBody } from "./errors";
import type { ApiSuccess, PaginationMeta, Paginated } from "./types";

/**
 * Browser API client.
 *
 * - `${NEXT_PUBLIC_API_URL}/api/v1`, `credentials: 'include'` (httpOnly cookies set by the API)
 * - unwraps the `{ success, data, meta }` envelope
 * - throws a typed `ApiError`
 * - on 401 performs ONE single-flight `POST /auth/refresh` and retries once;
 *   if the refresh fails the registered auth-failure handler runs (clear cache + go to /login)
 */

type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
  /** Skip the refresh-and-retry logic (used by the auth endpoints themselves). */
  skipAuthRefresh?: boolean;
}

export interface Envelope<T> {
  data: T;
  meta?: PaginationMeta;
}

// ----- global hooks wired by the providers -----
type Handler = (error: ApiError) => void;
let authFailureHandler: Handler | null = null;
let maintenanceHandler: Handler | null = null;

export function setAuthFailureHandler(handler: Handler | null) {
  authFailureHandler = handler;
}
export function setMaintenanceHandler(handler: Handler | null) {
  maintenanceHandler = handler;
}

export function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function statusToCode(status: number): ApiError["code"] {
  switch (status) {
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 413:
      return "PAYLOAD_TOO_LARGE";
    case 415:
      return "UNSUPPORTED_MEDIA_TYPE";
    case 429:
      return "RATE_LIMITED";
    case 502:
    case 504:
      return "UPSTREAM_ERROR";
    case 503:
      return "MAINTENANCE";
    default:
      return status >= 500 ? "INTERNAL_ERROR" : "UNKNOWN";
  }
}

async function parseResponse<T>(res: Response): Promise<Envelope<T>> {
  if (res.status === 204) return { data: undefined as T };

  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }

  if (!res.ok || isApiErrorBody(json)) {
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) || undefined : undefined;
    const requestId = res.headers.get("x-request-id") ?? undefined;
    if (isApiErrorBody(json)) throw ApiError.fromBody(json, res.status, { retryAfter, requestId });
    throw new ApiError({
      code: statusToCode(res.status),
      status: res.status,
      // Non-enveloped failure (proxy / gateway): never surface its raw text.
      message: "Request failed",
      retryAfter,
      requestId,
    });
  }

  if (json && typeof json === "object" && "success" in json && "data" in json) {
    const envelope = json as ApiSuccess<T>;
    return { data: envelope.data, meta: envelope.meta };
  }
  // Non-enveloped success (e.g. /health) — return as-is.
  return { data: json as T };
}

async function send<T>(path: string, opts: RequestOptions): Promise<Envelope<T>> {
  const { method = "GET", query, body, signal } = opts;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      credentials: "include",
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError({
      code: "NETWORK_ERROR",
      status: 0,
      message: "Network error",
    });
  }
  return parseResponse<T>(res);
}

// ----- single-flight refresh -----
let refreshPromise: Promise<boolean> | null = null;

/** Refresh the session once, de-duplicating concurrent callers. Resolves to `true` on success. */
export function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = send<unknown>("/auth/refresh", { method: "POST", body: {}, skipAuthRefresh: true })
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        // Keep the resolved promise briefly so a burst of 401s shares it.
        setTimeout(() => {
          refreshPromise = null;
        }, 1000);
      });
  }
  return refreshPromise;
}

function shouldAttemptRefresh(error: ApiError, opts: RequestOptions): boolean {
  if (opts.skipAuthRefresh) return false;
  // TOKEN_EXPIRED is the documented signal; a plain 401 also happens when the 15-minute
  // access cookie has already been dropped by the browser.
  return error.status === 401 && (error.code === "TOKEN_EXPIRED" || error.code === "UNAUTHORIZED");
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<Envelope<T>> {
  try {
    return await send<T>(path, opts);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;

    if (shouldAttemptRefresh(error, opts)) {
      const refreshed = await refreshSession();
      if (refreshed) {
        try {
          return await send<T>(path, { ...opts, skipAuthRefresh: true });
        } catch (retryError) {
          if (retryError instanceof ApiError && retryError.status === 401) {
            authFailureHandler?.(retryError);
          }
          if (retryError instanceof ApiError && retryError.code === "MAINTENANCE") {
            maintenanceHandler?.(retryError);
          }
          throw retryError;
        }
      }
      authFailureHandler?.(error);
      throw error;
    }

    if (error.code === "MAINTENANCE") maintenanceHandler?.(error);
    throw error;
  }
}

// ----- convenience helpers -----
export const api = {
  async get<T>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<T> {
    return (await request<T>(path, { query, signal })).data;
  },
  async page<T>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<Paginated<T>> {
    const res = await request<T[]>(path, { query, signal });
    const items = Array.isArray(res.data) ? res.data : [];
    return {
      items,
      meta: res.meta ?? { page: 1, limit: items.length, total: items.length, totalPages: 1 },
    };
  },
  async post<T>(path: string, body?: unknown, opts: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
    return (await request<T>(path, { ...opts, method: "POST", body: body ?? {} })).data;
  },
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return (await request<T>(path, { method: "PATCH", body: body ?? {} })).data;
  },
  async put<T>(path: string, body?: unknown): Promise<T> {
    return (await request<T>(path, { method: "PUT", body: body ?? {} })).data;
  },
  async delete(path: string): Promise<void> {
    await request<void>(path, { method: "DELETE" });
  },
};

// ----- multipart upload with progress (fetch has no upload progress) -----
export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

function xhrUpload<T>(path: string, form: FormData, opts: UploadOptions): Promise<Envelope<T>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildUrl(path));
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) opts.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      const headers = new Headers();
      const retryAfter = xhr.getResponseHeader("retry-after");
      if (retryAfter) headers.set("retry-after", retryAfter);
      const requestId = xhr.getResponseHeader("x-request-id");
      if (requestId) headers.set("x-request-id", requestId);
      const res = new Response(xhr.status === 204 ? null : xhr.responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers,
      });
      parseResponse<T>(res).then(resolve, reject);
    };
    xhr.onerror = () =>
      reject(new ApiError({ code: "NETWORK_ERROR", status: 0, message: "Network error" }));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

export async function upload<T>(path: string, form: FormData, opts: UploadOptions = {}): Promise<T> {
  try {
    return (await xhrUpload<T>(path, form, opts)).data;
  } catch (error) {
    if (error instanceof ApiError && shouldAttemptRefresh(error, {})) {
      if (await refreshSession()) {
        opts.onProgress?.(0);
        return (await xhrUpload<T>(path, form, opts)).data;
      }
      authFailureHandler?.(error);
    }
    if (error instanceof ApiError && error.code === "MAINTENANCE") maintenanceHandler?.(error);
    throw error;
  }
}
