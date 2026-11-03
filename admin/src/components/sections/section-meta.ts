import type { SectionPage } from '@/lib/api/sections';
import type { AdminSection, Platform, SectionContent, SectionType } from '@/lib/api/types';

export const SECTION_PAGE_META: Record<SectionPage, { label: string; description: string; webPath: string | null; defaultPlatform: Platform }> = {
  landing: { label: 'Landing page', description: 'Website home page (/)', webPath: '/', defaultPlatform: 'web' },
  pricing: { label: 'Pricing page', description: 'Website pricing page (/pricing)', webPath: '/pricing', defaultPlatform: 'web' },
  login: { label: 'Login screen', description: 'Website sign-in panel (/login)', webPath: '/login', defaultPlatform: 'web' },
  mobile_onboarding: {
    label: 'Mobile onboarding',
    description: 'Android app onboarding slides',
    webPath: null,
    defaultPlatform: 'mobile',
  },
  mobile_home: { label: 'Mobile home', description: 'Android app home screen', webPath: null, defaultPlatform: 'mobile' },
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  web: 'Web',
  mobile: 'Mobile',
  all: 'Web & mobile',
};

export function isSectionPage(value: string | null | undefined): value is SectionPage {
  return Boolean(value && value in SECTION_PAGE_META);
}

/** One-line summary of a section's content for list rows. */
export function sectionSummary(section: AdminSection): string {
  const type: SectionType = section.type;
  switch (type) {
    case 'hero':
    case 'features':
    case 'steps':
    case 'pricing':
    case 'cta':
    case 'onboarding_slide': {
      const c = section.content as SectionContent['hero'] | SectionContent['cta'];
      return c.title ?? '';
    }
    case 'logos':
    case 'testimonials':
    case 'faq': {
      const c = section.content as SectionContent['faq'];
      const count = Array.isArray(c.items) ? c.items.length : 0;
      return `${c.title ? `${c.title} · ` : ''}${count} item${count === 1 ? '' : 's'}`;
    }
    case 'stats': {
      const c = section.content as SectionContent['stats'];
      return (c.items ?? []).map((i) => i.value).join(' · ');
    }
    case 'rich_text': {
      const c = section.content as SectionContent['rich_text'];
      return (c.markdown ?? '').replace(/[#*_>`[\]()-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
    }
    default:
      return '';
  }
}
