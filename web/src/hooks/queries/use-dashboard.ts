"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { analyticsApi, dashboardApi } from "@/lib/api/dashboard";
import type { AnalyticsRange } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";

export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: () => dashboardApi.home() });
}

export function useAnalytics(range: AnalyticsRange) {
  return useQuery({
    queryKey: qk.analytics(range),
    queryFn: () => analyticsApi.overview(range),
    placeholderData: keepPreviousData,
  });
}
