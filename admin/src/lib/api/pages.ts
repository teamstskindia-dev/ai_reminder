'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api, type QueryParams } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { CmsPage, CmsPageSeo, CmsPageStatus } from './types';

export interface PageListParams extends QueryParams {
  q?: string;
  status?: CmsPageStatus;
  page?: number;
  limit?: number;
}

export interface PageInput {
  slug: string;
  title: string;
  content: string;
  seo?: CmsPageSeo;
  status?: CmsPageStatus;
}

export const pagesApi = {
  list: (params: PageListParams, signal?: AbortSignal) => api.list<CmsPage>('/admin/pages', params, signal),
  get: (id: string, signal?: AbortSignal) => api.get<CmsPage>(`/admin/pages/${id}`, undefined, signal),
  create: (body: PageInput) => api.post<CmsPage>('/admin/pages', body),
  update: (id: string, body: Partial<PageInput>) => api.patch<CmsPage>(`/admin/pages/${id}`, body),
  remove: (id: string) => api.delete(`/admin/pages/${id}`),
};

export function useCmsPages(params: PageListParams) {
  return useQuery({
    queryKey: queryKeys.pages.list(params),
    queryFn: ({ signal }) => pagesApi.list(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useCmsPage(id: string) {
  return useQuery({
    queryKey: queryKeys.pages.detail(id),
    queryFn: ({ signal }) => pagesApi.get(id, signal),
    enabled: Boolean(id),
  });
}

export function useCreateCmsPage() {
  return useApiMutation({
    mutationFn: pagesApi.create,
    invalidate: [queryKeys.pages.all],
    success: 'Page created',
  });
}

export function useUpdateCmsPage(id: string) {
  return useApiMutation({
    mutationFn: (body: Partial<PageInput>) => pagesApi.update(id, body),
    invalidate: [queryKeys.pages.all],
    success: 'Page saved',
  });
}

export function useDeleteCmsPage() {
  return useApiMutation({
    mutationFn: (id: string) => pagesApi.remove(id),
    invalidate: [queryKeys.pages.all],
    success: 'Page deleted',
  });
}
