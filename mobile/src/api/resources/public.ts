import { api, apiRequest } from '../client';
import { parseHeroContent, parseSlideContent, type ValidHero } from '@/providers/config/normalize';

import type { CmsPage, OnboardingSlideContent, PublicConfig, Section } from '../types';

export type ConfigFetchResult = { status: 'not-modified' } | { status: 'ok'; config: PublicConfig };

/** GET /public/config?platform=mobile with ETag revalidation (304 keeps the cached copy). */
export async function fetchPublicConfig(cachedVersion: string | null, signal?: AbortSignal): Promise<ConfigFetchResult> {
  const headers: Record<string, string> = {};
  if (cachedVersion) headers['If-None-Match'] = formatEtag(cachedVersion);
  const res = await apiRequest<PublicConfig>('/public/config', {
    query: { platform: 'mobile' },
    headers,
    auth: false,
    signal,
    timeoutMs: 8_000,
  });
  if (res.status === 304 || !res.data) return { status: 'not-modified' };
  return { status: 'ok', config: res.data };
}

function formatEtag(version: string): string {
  if (version.startsWith('"') || version.startsWith('W/')) return version;
  return `"${version}"`;
}

/** Onboarding slides, validated: malformed slides are dropped rather than rendered. */
export async function fetchOnboardingSlides(): Promise<Section<OnboardingSlideContent>[]> {
  const sections = await api<unknown>('/public/sections', {
    query: { page: 'mobile_onboarding', platform: 'mobile' },
    auth: false,
  });
  if (!Array.isArray(sections)) return [];
  const slides: Section<OnboardingSlideContent>[] = [];
  for (const raw of sections as Partial<Section>[]) {
    if (raw?.type !== 'onboarding_slide' || typeof raw.id !== 'string') continue;
    const content = parseSlideContent(raw.content);
    if (content) slides.push({ id: raw.id, page: 'mobile_onboarding', type: 'onboarding_slide', sortOrder: Number(raw.sortOrder) || 0, content });
  }
  return slides.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function fetchCmsPage(slug: string): Promise<CmsPage> {
  return api<CmsPage>(`/public/pages/${encodeURIComponent(slug)}`, { auth: false });
}

/** Login-page hero published for mobile (optional; the login screen falls back to branding). */
export async function fetchLoginHero(): Promise<ValidHero | null> {
  const sections = await api<unknown>('/public/sections', { query: { page: 'login', platform: 'mobile' }, auth: false });
  if (!Array.isArray(sections)) return null;
  const hero = (sections as Partial<Section>[]).find((s) => s?.type === 'hero');
  return hero ? parseHeroContent(hero.content) : null;
}
