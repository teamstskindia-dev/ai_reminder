'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api, type QueryParams } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { FailedJob, QueueName, QueueStats } from './types';

export const systemApi = {
  queues: (signal?: AbortSignal) => api.get<QueueStats[]>('/admin/system/queues', undefined, signal),
  failedJobs: (name: QueueName, params: QueryParams, signal?: AbortSignal) =>
    api.list<FailedJob>(`/admin/system/queues/${name}/failed`, params, signal),
  retryFailed: (name: QueueName) => api.post<{ retried: number }>(`/admin/system/queues/${name}/retry-failed`),
  flushCache: () => api.post<{ flushed: number }>('/admin/system/cache/flush'),
};

export function useQueues(options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: queryKeys.system.queues(),
    queryFn: ({ signal }) => systemApi.queues(signal),
    refetchInterval: options?.refetchInterval ?? false,
  });
}

export function useFailedJobs(name: QueueName | null, params: QueryParams) {
  return useQuery({
    queryKey: queryKeys.system.failed(name ?? 'calendar-sync', params),
    queryFn: ({ signal }) => systemApi.failedJobs(name as QueueName, params, signal),
    enabled: Boolean(name),
    placeholderData: keepPreviousData,
  });
}

export function useRetryFailed() {
  return useApiMutation({
    mutationFn: (name: QueueName) => systemApi.retryFailed(name),
    invalidate: [queryKeys.system.all, queryKeys.dashboard.all],
    success: (r) => `Retried ${r.retried} job${r.retried === 1 ? '' : 's'}`,
  });
}

export function useFlushCache() {
  return useApiMutation({
    mutationFn: () => systemApi.flushCache(),
    success: (r) => `Flushed ${r.flushed} cache key${r.flushed === 1 ? '' : 's'}`,
  });
}
