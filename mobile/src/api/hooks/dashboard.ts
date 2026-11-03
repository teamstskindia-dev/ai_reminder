import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { qk } from '../queryKeys';
import { fetchAnalyticsOverview, fetchDashboardHome } from '../resources/dashboard';
import type { AnalyticsRange } from '../types';

export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: fetchDashboardHome });
}

export function useAnalytics(range: AnalyticsRange, enabled = true) {
  return useQuery({
    queryKey: qk.analytics(range),
    queryFn: () => fetchAnalyticsOverview(range),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}
