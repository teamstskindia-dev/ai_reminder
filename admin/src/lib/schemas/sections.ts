import { z } from 'zod';

import type { SectionContent, SectionType } from '@/lib/api/types';

import {
  BODY_MAX,
  bodyText,
  hexColor,
  href,
  iconKey,
  imageUrl,
  nullableImageUrl,
  optionalTitleText,
  PAGE_MAX,
  requiredString,
  titleText,
} from './common';

/** Zod schemas identical to `SectionContent[type]` in the contract. */

const cta = z.object({ label: titleText('Label'), href });

/** Optional short text stored as `string | null`. */
const nullableTitle = (label: string) => optionalTitleText(label).nullable();
/** Required short text (titles, names, labels). */
const t = (label: string) => titleText(label);
/** Long text (descriptions, answers, quotes). */
const b = (label: string) => bodyText(label);

export const sectionContentSchemas = {
  hero: z.object({
    eyebrow: nullableTitle('Eyebrow'),
    title: t('Title'),
    subtitle: b('Subtitle'),
    primaryCta: cta,
    secondaryCta: cta.nullable(),
    imageUrl: nullableImageUrl,
    badges: z.array(t('Badge')).max(20, 'Use at most 20 badges'),
  }) satisfies z.ZodType<SectionContent['hero']>,
  logos: z.object({
    title: optionalTitleText('Title'),
    items: z.array(z.object({ name: t('Name'), imageUrl })).max(50, 'Use at most 50 logos'),
  }) satisfies z.ZodType<SectionContent['logos']>,
  features: z.object({
    eyebrow: nullableTitle('Eyebrow'),
    title: t('Title'),
    subtitle: b('Subtitle').nullable(),
    items: z
      .array(
        z.object({
          icon: iconKey,
          title: t('Title'),
          description: b('Description'),
          imageUrl: nullableImageUrl,
        }),
      )
      .max(50, 'Use at most 50 features'),
  }) satisfies z.ZodType<SectionContent['features']>,
  steps: z.object({
    title: t('Title'),
    subtitle: b('Subtitle').nullable(),
    items: z.array(z.object({ title: t('Title'), description: b('Description') })).max(20, 'Use at most 20 steps'),
  }) satisfies z.ZodType<SectionContent['steps']>,
  stats: z.object({
    items: z.array(z.object({ value: t('Value'), label: t('Label') })).max(20, 'Use at most 20 stats'),
  }) satisfies z.ZodType<SectionContent['stats']>,
  testimonials: z.object({
    title: optionalTitleText('Title'),
    items: z
      .array(
        z.object({
          quote: requiredString('Quote').max(BODY_MAX, `Quote must be ${BODY_MAX} characters or fewer`),
          name: t('Name'),
          role: optionalTitleText('Role'),
          avatarUrl: nullableImageUrl,
        }),
      )
      .max(50, 'Use at most 50 testimonials'),
  }) satisfies z.ZodType<SectionContent['testimonials']>,
  pricing: z.object({
    title: t('Title'),
    subtitle: b('Subtitle').nullable(),
  }) satisfies z.ZodType<SectionContent['pricing']>,
  faq: z.object({
    title: optionalTitleText('Title'),
    items: z
      .array(
        z.object({
          question: t('Question'),
          answer: requiredString('Answer').max(BODY_MAX, `Answer must be ${BODY_MAX} characters or fewer`),
        }),
      )
      .max(100, 'Use at most 100 questions'),
  }) satisfies z.ZodType<SectionContent['faq']>,
  cta: z.object({
    title: t('Title'),
    subtitle: b('Subtitle').nullable(),
    cta,
  }) satisfies z.ZodType<SectionContent['cta']>,
  rich_text: z.object({
    markdown: bodyText('Markdown', PAGE_MAX),
  }) satisfies z.ZodType<SectionContent['rich_text']>,
  onboarding_slide: z.object({
    title: t('Title'),
    description: b('Description'),
    imageUrl: nullableImageUrl,
    backgroundColor: hexColor.nullable(),
  }) satisfies z.ZodType<SectionContent['onboarding_slide']>,
} satisfies { [K in SectionType]: z.ZodType<SectionContent[K]> };

export const SECTION_TYPE_META: Record<SectionType, { label: string; description: string }> = {
  hero: { label: 'Hero', description: 'Headline, subtitle, call-to-action buttons, image and badges' },
  logos: { label: 'Logos', description: 'A strip of customer or partner logos' },
  features: { label: 'Features', description: 'Grid of features with icons and optional images' },
  steps: { label: 'Steps', description: 'Numbered "how it works" steps' },
  stats: { label: 'Stats', description: 'Big numbers with labels' },
  testimonials: { label: 'Testimonials', description: 'Customer quotes with avatars' },
  pricing: { label: 'Pricing', description: 'Pricing table title — plans come from Content → Plans' },
  faq: { label: 'FAQ', description: 'Questions and answers' },
  cta: { label: 'Call to action', description: 'Closing headline with one button' },
  rich_text: { label: 'Rich text', description: 'Free-form markdown' },
  onboarding_slide: { label: 'Onboarding slide', description: 'Mobile onboarding slide with image and colour' },
};

/** Starter content used when an admin adds a new section of a type. */
export function defaultSectionContent<T extends SectionType>(type: T): SectionContent[T] {
  const defaults: { [K in SectionType]: SectionContent[K] } = {
    hero: {
      eyebrow: null,
      title: 'A clear, benefit-driven headline',
      subtitle: 'One or two sentences that explain what the product does and for whom.',
      primaryCta: { label: 'Get started', href: '/login' },
      secondaryCta: null,
      imageUrl: null,
      badges: [],
    },
    logos: { title: 'Trusted by teams everywhere', items: [] },
    features: {
      eyebrow: null,
      title: 'Features',
      subtitle: null,
      items: [{ icon: 'sparkles', title: 'Feature title', description: 'Short description.', imageUrl: null }],
    },
    steps: {
      title: 'How it works',
      subtitle: null,
      items: [{ title: 'First step', description: 'Describe the step.' }],
    },
    stats: { items: [{ value: '10x', label: 'faster follow-ups' }] },
    testimonials: { title: 'What people say', items: [] },
    pricing: { title: 'Simple pricing', subtitle: null },
    faq: { title: 'Frequently asked questions', items: [{ question: 'A common question?', answer: 'A helpful answer.' }] },
    cta: { title: 'Ready to get started?', subtitle: null, cta: { label: 'Get started', href: '/login' } },
    rich_text: { markdown: '## Heading\n\nWrite markdown here.' },
    onboarding_slide: { title: 'Slide title', description: 'Slide description.', imageUrl: null, backgroundColor: '#EEF0FF' },
  };
  return structuredClone(defaults[type]) as SectionContent[T];
}

/** Section types that make sense on each page (all types remain selectable). */
export const SUGGESTED_TYPES: Record<string, SectionType[]> = {
  landing: ['hero', 'logos', 'features', 'steps', 'stats', 'testimonials', 'pricing', 'faq', 'cta', 'rich_text'],
  pricing: ['pricing', 'faq', 'cta', 'rich_text'],
  login: ['hero', 'rich_text'],
  mobile_onboarding: ['onboarding_slide'],
  mobile_home: ['hero', 'features', 'stats', 'cta', 'rich_text'],
};
