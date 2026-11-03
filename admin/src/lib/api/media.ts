'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api, type QueryParams } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { MediaAsset } from './types';

export interface MediaListParams extends QueryParams {
  folder?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface UploadMediaInput {
  file: File;
  folder?: string;
  alt?: string;
}

/** Upload rules mirrored from POST /admin/media/upload: image ≤ 10 MB, png, jpg, webp, svg, gif, ico. */
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_TYPES: Record<string, readonly string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/pjpeg'],
  jpeg: ['image/jpeg', 'image/pjpeg'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  ico: ['image/x-icon', 'image/vnd.microsoft.icon', 'image/ico'],
  // The contract allows SVG uploads; the API is responsible for sanitising them before serving.
  svg: ['image/svg+xml'],
};
export const MEDIA_ACCEPT = [...new Set(Object.values(MEDIA_TYPES).flat()), ...Object.keys(MEDIA_TYPES).map((e) => `.${e}`)].join(',');
export const MEDIA_ALLOWED_LABEL = 'PNG, JPG, WebP, SVG, GIF or ICO';

/** Client-side pre-check so obviously invalid files never leave the browser. Returns an error message or null. */
export function validateMediaFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const allowed = MEDIA_TYPES[ext];
  if (!allowed) return `${file.name}: only ${MEDIA_ALLOWED_LABEL} images are allowed`;
  // Browsers sometimes report an empty type (e.g. .ico); otherwise the type must match the extension.
  if (file.type && !allowed.includes(file.type)) {
    return `${file.name}: the file content type (${file.type}) does not match its .${ext} extension`;
  }
  if (file.size === 0) return `${file.name} is empty`;
  if (file.size > MEDIA_MAX_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB`;
  }
  return null;
}

export const mediaApi = {
  list: (params: MediaListParams, signal?: AbortSignal) => api.list<MediaAsset>('/admin/media', params, signal),
  upload: ({ file, folder, alt }: UploadMediaInput) => {
    const form = new FormData();
    form.append('file', file);
    if (folder) form.append('folder', folder);
    if (alt) form.append('alt', alt);
    return api.post<MediaAsset>('/admin/media/upload', form);
  },
  update: (id: string, body: { alt: string | null }) => api.patch<MediaAsset>(`/admin/media/${id}`, body),
  remove: (id: string) => api.delete(`/admin/media/${id}`),
};

export function useMedia(params: MediaListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.media.list(params),
    queryFn: ({ signal }) => mediaApi.list(params, signal),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  });
}

export function useUploadMedia() {
  return useApiMutation({
    mutationFn: mediaApi.upload,
    invalidate: [queryKeys.media.all],
    success: (asset) => `Uploaded ${asset.publicId}`,
    errorAction: 'upload',
  });
}

export function useUpdateMedia() {
  return useApiMutation({
    mutationFn: ({ id, alt }: { id: string; alt: string | null }) => mediaApi.update(id, { alt }),
    invalidate: [queryKeys.media.all],
    success: 'Alt text saved',
  });
}

export function useDeleteMedia() {
  return useApiMutation({
    mutationFn: (id: string) => mediaApi.remove(id),
    invalidate: [queryKeys.media.all],
    success: 'Media deleted',
  });
}
