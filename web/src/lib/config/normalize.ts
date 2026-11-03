import type {
  AnySection,
  Banner,
  NavItem,
  NavLocation,
  Plan,
  PublicConfig,
  Theme,
  ThemeMode,
} from "@/lib/api/types";
import { DEFAULT_CONFIG } from "./defaults";

/**
 * Defensive normalisation of admin-edited config: every missing / malformed field falls back to
 * the bundled default so no page ever crashes because of a config gap.
 */

type Loose<T> = { [K in keyof T]?: unknown };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
const nonEmpty = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

function mergeFlat<T extends object>(defaults: T, value: unknown): T {
  if (!isObject(value)) return defaults;
  const out = { ...defaults } as Record<string, unknown>;
  for (const [key, def] of Object.entries(defaults)) {
    const v = value[key];
    if (v === undefined || v === null) continue;
    if (typeof def === "boolean") out[key] = bool(v, def);
    else if (typeof def === "number") out[key] = typeof v === "number" && Number.isFinite(v) ? v : def;
    else if (typeof def === "string") out[key] = str(v, def);
    else if (Array.isArray(def)) out[key] = Array.isArray(v) ? v : def;
    else out[key] = v;
  }
  return out as T;
}

// Theme values are inlined into a <style> tag, so they are validated strictly (anything else → default).
const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;
const SAFE_FONT = /^[A-Za-z0-9 \-]{1,64}$/;
const MODES: readonly ThemeMode[] = ["light", "dark", "system"];

export function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && SAFE_COLOR.test(value) ? value : fallback;
}

export function normalizeTheme(value: unknown): Theme {
  const d = DEFAULT_CONFIG.theme;
  const t: Loose<Theme> = isObject(value) ? value : {};
  const mode = t.defaultMode;
  const radius = typeof t.radius === "number" && Number.isFinite(t.radius) ? Math.min(Math.max(t.radius, 0), 32) : d.radius;
  const font = typeof t.fontFamily === "string" && SAFE_FONT.test(t.fontFamily) ? t.fontFamily : d.fontFamily;
  return {
    primaryColor: safeColor(t.primaryColor, d.primaryColor),
    primaryForeground: safeColor(t.primaryForeground, d.primaryForeground),
    accentColor: safeColor(t.accentColor, d.accentColor),
    sidebarBackground: safeColor(t.sidebarBackground, d.sidebarBackground),
    sidebarForeground: safeColor(t.sidebarForeground, d.sidebarForeground),
    radius,
    fontFamily: font,
    defaultMode: MODES.includes(mode as ThemeMode) ? (mode as ThemeMode) : d.defaultMode,
  };
}

function normalizeNavItems(value: unknown, fallback: NavItem[]): NavItem[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((item): item is Record<string, unknown> => isObject(item) && typeof item.label === "string" && typeof item.href === "string")
    .map((item, index) => ({
      id: str(item.id, `nav-${index}`),
      label: item.label as string,
      href: item.href as string,
      icon: (typeof item.icon === "string" ? item.icon : null) as NavItem["icon"],
      groupLabel: typeof item.groupLabel === "string" ? item.groupLabel : null,
      isExternal: bool(item.isExternal, false),
      sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : index,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeBanners(value: unknown): Banner[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((b): b is Record<string, unknown> => isObject(b) && typeof b.title === "string")
    .map((b, index) => ({
      id: str(b.id, `banner-${index}`),
      placement: (str(b.placement, "dashboard") as Banner["placement"]),
      variant: (["info", "success", "warning", "promo"].includes(b.variant as string) ? b.variant : "info") as Banner["variant"],
      title: b.title as string,
      body: typeof b.body === "string" ? b.body : null,
      imageUrl: typeof b.imageUrl === "string" && b.imageUrl ? b.imageUrl : null,
      ctaLabel: typeof b.ctaLabel === "string" && b.ctaLabel ? b.ctaLabel : null,
      ctaUrl: typeof b.ctaUrl === "string" && b.ctaUrl ? b.ctaUrl : null,
    }));
}

export function normalizeConfig(value: unknown): PublicConfig {
  const d = DEFAULT_CONFIG;
  const c: Loose<PublicConfig> = isObject(value) ? value : {};
  const nav = isObject(c.navigation) ? c.navigation : {};
  const locations: NavLocation[] = ["header", "footer", "sidebar", "mobile_tab"];
  const branding = mergeFlat(d.branding, c.branding);
  branding.appName = nonEmpty(branding.appName, d.branding.appName);
  const seo = mergeFlat(d.seo, c.seo);
  seo.keywords = Array.isArray(seo.keywords) ? seo.keywords.filter((k): k is string => typeof k === "string") : [];
  return {
    branding,
    theme: normalizeTheme(c.theme),
    features: mergeFlat(d.features, c.features),
    app: mergeFlat(d.app, c.app),
    seo,
    navigation: Object.fromEntries(
      locations.map((loc) => [loc, normalizeNavItems(nav[loc], d.navigation[loc])]),
    ) as Record<NavLocation, NavItem[]>,
    banners: normalizeBanners(c.banners),
    version: str(c.version, "unknown"),
  };
}

export function normalizeSections(value: unknown): AnySection[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((s): s is AnySection => isObject(s) && typeof s.type === "string" && isObject(s.content))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function normalizePlans(value: unknown): Plan[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((p): p is Plan => isObject(p) && typeof p.name === "string")
    .map((p) => ({
      ...p,
      features: Array.isArray(p.features) ? p.features : [],
      priceMonthly: Number(p.priceMonthly) || 0,
      priceYearly: Number(p.priceYearly) || 0,
      currency: p.currency || "USD",
    }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
