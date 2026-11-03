'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api, type QueryParams } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { AdminMeetingDetail, AdminMeetingListItem, MeetingStatus, TranscriptSegment } from './types';

export interface MeetingListParams extends QueryParams {
  q?: string;
  status?: MeetingStatus;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export const meetingsApi = {
  list: (params: MeetingListParams, signal?: AbortSignal) =>
    api.list<AdminMeetingListItem>('/admin/meetings', params, signal),
  get: (id: string, signal?: AbortSignal) => api.get<AdminMeetingDetail>(`/admin/meetings/${id}`, undefined, signal),
  transcript: (id: string, signal?: AbortSignal) =>
    api.get<TranscriptSegment[]>(`/admin/meetings/${id}/transcript`, undefined, signal),
  reprocess: (id: string) => api.post<{ queued: true }>(`/admin/meetings/${id}/reprocess`),
  remove: (id: string) => api.delete(`/admin/meetings/${id}`),
};

export function useMeetings(params: MeetingListParams) {
  return useQuery({
    queryKey: queryKeys.meetings.list(params),
    queryFn: ({ signal }) => meetingsApi.list(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useMeeting(id: string) {
  return useQuery({
    queryKey: queryKeys.meetings.detail(id),
    queryFn: ({ signal }) => meetingsApi.get(id, signal),
    enabled: Boolean(id),
  });
}

export function useMeetingTranscript(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.meetings.transcript(id),
    queryFn: ({ signal }) => meetingsApi.transcript(id, signal),
    enabled: Boolean(id) && enabled,
  });
}

export function useReprocessMeeting() {
  return useApiMutation({
    mutationFn: (id: string) => meetingsApi.reprocess(id),
    invalidate: (_d, id) => [queryKeys.meetings.detail(id), queryKeys.system.all],
    success: 'Queued for AI reprocessing',
  });
}

export function useDeleteMeeting() {
  return useApiMutation({
    mutationFn: (id: string) => meetingsApi.remove(id),
    invalidate: [queryKeys.meetings.all, queryKeys.users.all, queryKeys.dashboard.all],
    success: 'Meeting deleted',
  });
}
