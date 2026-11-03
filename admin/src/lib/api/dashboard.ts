'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from './client';
import { queryKeys } from './query-keys';
import type { AdminDashboardStats } from './types';

export const dashboardApi = {
  stats: (signal?: AbortSignal) => api.get<AdminDashboardStats>('/admin/dashboard/stats', undefined, signal),
};

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: ({ signal }) => dashboardApi.stats(signal),
    refetchInterval: 60_000,
  });
}
