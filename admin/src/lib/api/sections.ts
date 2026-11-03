'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { AdminSection, Platform, SectionContent, SectionType } from './types';

export const SECTION_PAGES = ['landing', 'pricing', 'login', 'mobile_onboarding', 'mobile_home'] as const;
export type SectionPage = (typeof SECTION_PAGES)[number];

export interface SectionListParams {
  page?: string;
  platform?: Platform;
  [key: string]: string | undefined;
}

export interface CreateSectionInput<T extends SectionType = SectionType> {
  page: string;
  type: T;
  name: string;
  content: SectionContent[T];
  platform?: Platform;
  isActive?: boolean;
}

export type UpdateSectionInput = Partial<CreateSectionInput>;

export const sectionsApi = {
  list: (params: SectionListParams, signal?: AbortSignal) =>
    api.get<AdminSection[]>('/admin/sections', params, signal),
  create: (body: CreateSectionInput) => api.post<AdminSection>('/admin/sections', body),
  update: (id: string, body: UpdateSectionInput) => api.patch<AdminSection>(`/admin/sections/${id}`, body),
  remove: (id: string) => api.delete(`/admin/sections/${id}`),
  reorder: (ids: string[]) => api.post<AdminSection[]>('/admin/sections/reorder', { ids }),
};

export function useSections(params: SectionListParams) {
  return useQuery({
    queryKey: queryKeys.sections.list(params),
    queryFn: ({ signal }) => sectionsApi.list(params, signal),
  });
}

/** There is no GET /admin/sections/:id, so the editor reads the full list and picks the row. */
export function useSection(id: string) {
  const query = useSections({});
  return { ...query, data: query.data?.find((s) => s.id === id) };
}

export function useCreateSection() {
  return useApiMutation({
    mutationFn: sectionsApi.create,
    invalidate: [queryKeys.sections.all],
    success: 'Section created',
  });
}

export function useUpdateSection(options?: { silent?: boolean }) {
  return useApiMutation({
    mutationFn: ({ id, ...body }: UpdateSectionInput & { id: string }) => sectionsApi.update(id, body),
    invalidate: [queryKeys.sections.all],
    success: options?.silent ? false : 'Section saved',
  });
}

export function useDeleteSection() {
  return useApiMutation({
    mutationFn: (id: string) => sectionsApi.remove(id),
    invalidate: [queryKeys.sections.all],
    success: 'Section deleted',
  });
}

export function useReorderSections() {
  return useApiMutation({
    mutationFn: (ids: string[]) => sectionsApi.reorder(ids),
    invalidate: [queryKeys.sections.all],
    success: 'Order saved',
  });
}
