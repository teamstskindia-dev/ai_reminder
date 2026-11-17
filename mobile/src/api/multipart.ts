import { API_BASE_URL } from '@/utils/env';

import { refreshSession } from './client';
import { ApiError } from './errors';
import { getAccessToken } from './tokens';
import type { ErrorCode } from './types';

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: ErrorCode; message: string }; requestId?: string };

export interface MultipartFile {
  uri: string;
  name: string;
  type: string;
}

interface MultipartOptions {
  method?: 'POST' | 'PUT';
  fields?: Record<string, string | number>;
  file: MultipartFile;
  timeoutMs?: number;
}

/**
 * One multipart request through React Native's XMLHttpRequest. Not fetch: Expo replaces the global
 * fetch with `expo/fetch`, which rejects React Native's `{ uri, name, type }` file parts. The file is
 * streamed from its URI, so large recordings never load into JS memory.
 */
function send<T>(path: string, options: MultipartOptions, token: string | null): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(options.fields ?? {})) form.append(key, String(value));
  form.append('file', options.file as unknown as Blob);

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method ?? 'POST', `${API_BASE_URL}${path}`);
    xhr.timeout = options.timeoutMs ?? 120_000;
    xhr.setRequestHeader('Accept', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.onload = () => {
      let json: Envelope<T> | null = null;
      try {
        json = JSON.parse(xhr.responseText) as Envelope<T>;
      } catch {
        json = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && json?.success === true) {
        resolve(json.data);
        return;
      }
      const body = json && json.success === false ? json : null;
      reject(
        new ApiError({
          code: body?.error.code ?? 'INTERNAL_ERROR',
          status: xhr.status,
          message: body?.error.message ?? `Request failed (${xhr.status})`,
          requestId: body?.requestId ?? null,
        }),
      );
    };
    xhr.onerror = () => reject(new ApiError({ code: 'NETWORK_ERROR', status: 0, message: 'Network request failed' }));
    xhr.ontimeout = () => reject(new ApiError({ code: 'TIMEOUT', status: 0, message: 'Request timed out' }));
    xhr.send(form);
  });
}

/** Multipart upload with the Bearer token and one refresh-and-retry on 401. */
export async function uploadMultipart<T>(path: string, options: MultipartOptions): Promise<T> {
  try {
    return await send<T>(path, options, await getAccessToken());
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const next = await refreshSession();
    if (!next) throw error;
    return send<T>(path, options, next);
  }
}
