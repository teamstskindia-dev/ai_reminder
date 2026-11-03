import { z } from 'zod';

import type { AppMeta, Banner, Branding, Features, NavItem, NavLocation, PublicConfig, Seo, Theme } from '@/api/types';
import { contrastRatio, readableOn } from '@/theme/color';
import { logger } from '@/utils/logger';

import { DEFAULT_CONFIG } from './defaultConfig';

/**
 * Validates the remote (or cached) config with zod and merges it FIELD BY FIELD onto the bundled
 * defaults: one bad value never discards the rest, and a malformed config can never crash the app or
 * produce an unreadable theme.
 */

const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/);
const httpsUrl = z.string().trim().max(2048).regex(/^https:\/\/[^\s"'<>`]+$/);
const optionalHttpsUrl = z.union([httpsUrl, z.literal('')]);
const text = (max: number) => z.string().trim().max(max);
const label = (max: number) => z.string().trim().min(1).max(max);
const semver = z.string().trim().regex(/^\d+(\.\d+){0,2}(-[0-9A-Za-z.-]+)?$/);
const email = z.string().trim().max(254).regex(/^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/);

let invalidFields = 0;

function pick<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  if (value !== undefined) invalidFields++;
  return fallback;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function branding(raw: unknown): Branding {
  const r = record(raw);
  const d = DEFAULT_CONFIG.branding;
  return {
    appName: pick(label(40), r.appName, d.appName),
    tagline: pick(text(160), r.tagline, d.tagline),
    logoUrl: pick(optionalHttpsUrl, r.logoUrl, d.logoUrl),
    logoDarkUrl: pick(optionalHttpsUrl, r.logoDarkUrl, d.logoDarkUrl),
    iconUrl: pick(optionalHttpsUrl, r.iconUrl, d.iconUrl),
    faviconUrl: pick(optionalHttpsUrl, r.faviconUrl, d.faviconUrl),
    supportEmail: pick(z.union([email, z.literal('')]), r.supportEmail, d.supportEmail),
    companyName: pick(text(80), r.companyName, d.companyName),
  };
}

function theme(raw: unknown): Theme {
  const r = record(raw);
  const d = DEFAULT_CONFIG.theme;
  const primaryColor = pick(hex, r.primaryColor, d.primaryColor);
  let primaryForeground = pick(hex, r.primaryForeground, d.primaryForeground);
  // Text on primary buttons must stay readable whatever the admin picks.
  if (contrastRatio(primaryForeground, primaryColor) < 3) primaryForeground = readableOn(primaryColor);
  const radius = pick(z.number().finite(), r.radius, d.radius);
  return {
    primaryColor,
    primaryForeground,
    accentColor: pick(hex, r.accentColor, d.accentColor),
    sidebarBackground: pick(hex, r.sidebarBackground, d.sidebarBackground),
    sidebarForeground: pick(hex, r.sidebarForeground, d.sidebarForeground),
    radius: Math.min(24, Math.max(0, radius)),
    fontFamily: pick(text(60), r.fontFamily, d.fontFamily),
    defaultMode: pick(z.enum(['light', 'dark', 'system']), r.defaultMode, d.defaultMode),
  };
}

function features(raw: unknown): Features {
  const r = record(raw);
  const d = DEFAULT_CONFIG.features;
  const out = { ...d };
  for (const key of Object.keys(d) as (keyof Features)[]) out[key] = pick(z.boolean(), r[key], d[key]);
  return out;
}

function app(raw: unknown): AppMeta {
  const r = record(raw);
  const d = DEFAULT_CONFIG.app;
  return {
    maintenanceMode: pick(z.boolean(), r.maintenanceMode, d.maintenanceMode),
    maintenanceMessage: pick(text(500), r.maintenanceMessage, d.maintenanceMessage),
    minAppVersion: pick(semver, r.minAppVersion, d.minAppVersion),
    latestAppVersion: pick(semver, r.latestAppVersion, d.latestAppVersion),
    androidStoreUrl: pick(optionalHttpsUrl, r.androidStoreUrl, d.androidStoreUrl),
    iosStoreUrl: pick(optionalHttpsUrl, r.iosStoreUrl, d.iosStoreUrl),
  };
}

function seo(raw: unknown): Seo {
  const r = record(raw);
  const d = DEFAULT_CONFIG.seo;
  return {
    title: pick(text(200), r.title, d.title),
    description: pick(text(500), r.description, d.description),
    ogImageUrl: pick(optionalHttpsUrl, r.ogImageUrl, d.ogImageUrl),
    keywords: pick(z.array(text(60)).max(30), r.keywords, d.keywords),
  };
}

const navItemSchema = z.object({
  id: label(100),
  label: label(30),
  href: label(300),
  icon: z.string().trim().max(40).nullish().transform((v) => v ?? null),
  groupLabel: z.string().trim().max(60).nullish().transform((v) => v ?? null),
  isExternal: z.boolean().catch(false),
  sortOrder: z.number().finite().catch(0),
});

function navList(raw: unknown, fallback: NavItem[]): NavItem[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) invalidFields++;
    return fallback;
  }
  const items: NavItem[] = [];
  for (const entry of raw.slice(0, 50)) {
    const parsed = navItemSchema.safeParse(entry);
    if (parsed.success) items.push(parsed.data as NavItem);
    else invalidFields++;
  }
  return items;
}

const bannerSchema = z.object({
  id: label(100),
  placement: z.enum(['dashboard', 'landing_top', 'mobile_home']),
  variant: z.enum(['info', 'success', 'warning', 'promo']).catch('info'),
  title: label(140),
  body: text(600).nullish().transform((v) => v || null),
  imageUrl: httpsUrl.nullish().catch(null).transform((v) => v ?? null),
  ctaLabel: text(40).nullish().transform((v) => v || null),
  // Validated again by the link allowlist when tapped.
  ctaUrl: text(2048).nullish().transform((v) => v || null),
});

function banners(raw: unknown): Banner[] {
  if (!Array.isArray(raw)) return [];
  const out: Banner[] = [];
  for (const entry of raw.slice(0, 20)) {
    const parsed = bannerSchema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
    else invalidFields++;
  }
  return out;
}

export function normalizeConfig(raw: unknown): PublicConfig | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  invalidFields = 0;
  const r = raw as Record<string, unknown>;
  const nav = record(r.navigation);
  const navigation: Record<NavLocation, NavItem[]> = {
    header: navList(nav.header, []),
    footer: navList(nav.footer, []),
    sidebar: navList(nav.sidebar, []),
    mobile_tab: navList(nav.mobile_tab, DEFAULT_CONFIG.navigation.mobile_tab),
  };
  const config: PublicConfig = {
    branding: branding(r.branding),
    theme: theme(r.theme),
    features: features(r.features),
    app: app(r.app),
    seo: seo(r.seo),
    navigation,
    banners: banners(r.banners),
    version: pick(text(200), r.version, ''),
  };
  if (invalidFields) logger.debug('Config: invalid values replaced by defaults', { count: invalidFields });
  return config;
}

// ---------- CMS sections ----------
const slideSchema = z.object({
  title: label(120),
  description: text(400).catch(''),
  imageUrl: httpsUrl.nullish().catch(null).transform((v) => v ?? null),
  backgroundColor: hex.nullish().catch(null).transform((v) => v ?? null),
});

export type ValidSlide = z.infer<typeof slideSchema>;

/** Validates onboarding slide content; invalid slides are dropped. */
export function parseSlideContent(content: unknown): ValidSlide | null {
  const parsed = slideSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

const heroSchema = z.object({
  title: label(160),
  subtitle: text(400).catch(''),
  imageUrl: httpsUrl.nullish().catch(null).transform((v) => v ?? null),
  badges: z.array(text(80)).max(6).catch([]),
});

export type ValidHero = z.infer<typeof heroSchema>;

export function parseHeroContent(content: unknown): ValidHero | null {
  const parsed = heroSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}
