import type { FeatureKey, NavItem } from '@/api/types';
import { useConfig } from '@/providers/config/ConfigProvider';

/** Tab route names the app implements (contract: mobile tab hrefs are expo-router tab names). */
export const TAB_ROUTES = ['home', 'meetings', 'reminders', 'ask', 'profile'] as const;
export type TabRoute = (typeof TAB_ROUTES)[number];

/** Features a tab needs; any one of them keeps the tab visible. */
const TAB_FEATURES: Partial<Record<TabRoute, FeatureKey[]>> = {
  reminders: ['reminders', 'actionItems'],
  ask: ['askAi'],
};

export function isTabRoute(value: string): value is TabRoute {
  return (TAB_ROUTES as readonly string[]).includes(value);
}

function normalizeHref(href: string): string {
  return href.trim().replace(/^\/+/, '').replace(/^\(tabs\)\//, '').toLowerCase();
}

export interface VisibleTab {
  route: TabRoute;
  item: NavItem;
}

/**
 * Tabs to show, in config order: only known routes, de-duplicated, and hidden when their feature is off
 * (the server already filters by feature flag; this is a client-side safety net).
 */
export function resolveVisibleTabs(items: NavItem[], isEnabled: (feature: FeatureKey) => boolean): VisibleTab[] {
  const seen = new Set<TabRoute>();
  const out: VisibleTab[] = [];
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const item of sorted) {
    const route = normalizeHref(item.href);
    if (!isTabRoute(route) || seen.has(route)) continue;
    const needs = TAB_FEATURES[route];
    if (needs && !needs.some(isEnabled)) continue;
    seen.add(route);
    out.push({ route, item });
  }
  return out;
}

export function useVisibleTabs(): VisibleTab[] {
  const { config, isEnabled } = useConfig();
  return resolveVisibleTabs(config.navigation.mobile_tab, isEnabled);
}

/** The route to land on after sign-in: the first configured tab (home when nothing is configured). */
export function useHomeRoute(): `/${TabRoute}` {
  const tabs = useVisibleTabs();
  return `/${tabs[0]?.route ?? 'home'}`;
}

/** The admin-configured label for a tab (used as the screen title), with a fallback. */
export function useTabLabel(route: TabRoute, fallback: string): string {
  const { config } = useConfig();
  const item = config.navigation.mobile_tab.find((t) => normalizeHref(t.href) === route);
  return item?.label || fallback;
}
