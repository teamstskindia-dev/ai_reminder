'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api, type QueryParams } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { Broadcast, BroadcastAudience, NotificationTemplate, ReminderChannel } from './types';

export interface UpdateTemplateInput {
  name?: string;
  titleTemplate: string;
  bodyTemplate: string;
  emailSubject?: string | null;
  emailBody?: string | null;
  channels: ReminderChannel[];
  isActive: boolean;
}

export interface CreateBroadcastInput {
  title: string;
  body: string;
  channels: ReminderChannel[];
  audience: BroadcastAudience;
  data?: Record<string, unknown>;
}

export const notificationsApi = {
  templates: (signal?: AbortSignal) =>
    api.get<NotificationTemplate[]>('/admin/notification-templates', undefined, signal),
  updateTemplate: (key: string, body: UpdateTemplateInput) =>
    api.put<NotificationTemplate>(`/admin/notification-templates/${key}`, body),
  broadcasts: (params: QueryParams, signal?: AbortSignal) => api.list<Broadcast>('/admin/broadcasts', params, signal),
  createBroadcast: (body: CreateBroadcastInput) => api.post<Broadcast>('/admin/broadcasts', body),
};

export function useNotificationTemplates() {
  return useQuery({
    queryKey: queryKeys.templates.list(),
    queryFn: ({ signal }) => notificationsApi.templates(signal),
  });
}

export function useUpdateNotificationTemplate(key: string) {
  return useApiMutation({
    mutationFn: (body: UpdateTemplateInput) => notificationsApi.updateTemplate(key, body),
    invalidate: [queryKeys.templates.all],
    success: 'Template saved',
  });
}

export function useBroadcasts(params: QueryParams) {
  return useQuery({
    queryKey: queryKeys.broadcasts.list(params),
    queryFn: ({ signal }) => notificationsApi.broadcasts(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useCreateBroadcast() {
  return useApiMutation({
    mutationFn: notificationsApi.createBroadcast,
    invalidate: [queryKeys.broadcasts.all],
    success: (b) => `Broadcast sent to ${b.sentCount} user${b.sentCount === 1 ? '' : 's'}`,
  });
}
