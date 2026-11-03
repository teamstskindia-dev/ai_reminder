import { api } from '../client';
import type {
  AnalyticsOverview,
  AnalyticsRange,
  DashboardHome,
} from '../types';

export function fetchDashboardHome(): Promise<DashboardHome> {
  return api<DashboardHome>('/dashboard/home', { query: { platform: 'mobile' } });
}

export function fetchAnalyticsOverview(range: AnalyticsRange): Promise<AnalyticsOverview> {
  return api<AnalyticsOverview>('/analytics/overview', { query: { range } });
}
