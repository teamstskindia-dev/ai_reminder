'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { AdminBanner, BannerPlacement, BannerVariant, Platform } from './types';

export interface BannerListParams {
  platform?: Platform;
  placement?: BannerPlacement;
  [key: string]: string | undefined;
}

export interface BannerInput {
  platform: Platform;
  placement: BannerPlacement;
  variant: BannerVariant;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
}

export const bannersApi = {
  list: (params: BannerListParams, signal?: AbortSignal) => api.get<AdminBanner[]>('/admin/banners', params, signal),
  create: (body: BannerInput) => api.post<AdminBanner>('/admin/banners', body),
  update: (id: string, body: Partial<BannerInput>) => api.patch<AdminBanner>(`/admin/banners/${id}`, body),
  remove: (id: string) => api.delete(`/admin/banners/${id}`),
};

export function useBanners(params: BannerListParams) {
  return useQuery({
    queryKey: queryKeys.banners.list(params),
    queryFn: ({ signal }) => bannersApi.list(params, signal),
  });
}

export function useCreateBanner() {
  return useApiMutation({
    mutationFn: bannersApi.create,
    invalidate: [queryKeys.banners.all],
    success: 'Banner created',
  });
}

export function useUpdateBanner(options?: { silent?: boolean }) {
  return useApiMutation({
    mutationFn: ({ id, ...body }: Partial<BannerInput> & { id: string }) => bannersApi.update(id, body),
    invalidate: [queryKeys.banners.all],
    success: options?.silent ? false : 'Banner saved',
  });
}

export function useDeleteBanner() {
  return useApiMutation({
    mutationFn: (id: string) => bannersApi.remove(id),
    invalidate: [queryKeys.banners.all],
    success: 'Banner deleted',
  });
}
