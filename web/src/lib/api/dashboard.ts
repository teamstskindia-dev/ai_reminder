import { api } from "./client";
import type { AnalyticsOverview, AnalyticsRange, DashboardHome } from "./types";

export const dashboardApi = {
  home: () => api.get<DashboardHome>("/dashboard/home", { platform: "web" }),
};

export const analyticsApi = {
  overview: (range: AnalyticsRange) => api.get<AnalyticsOverview>("/analytics/overview", { range }),
};
