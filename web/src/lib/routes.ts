import type { FeatureKey } from "@/lib/api/types";

/** App routes guarded by a feature flag (nav items are already filtered by the API). */
export const ROUTE_FEATURES: { prefix: string; feature: FeatureKey; label: string }[] = [
  { prefix: "/analytics/overview", feature: "analytics", label: "Analytics" },
  { prefix: "/action-items", feature: "actionItems", label: "Action items" },
  { prefix: "/reminders", feature: "reminders", label: "Reminders" },
  { prefix: "/ask", feature: "askAi", label: "Ask AI" },
];

export function featureForPath(pathname: string) {
  return ROUTE_FEATURES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)) ?? null;
}

export const reportHref = (meetingId: string) => `/analytics/reports/${encodeURIComponent(meetingId)}`;
