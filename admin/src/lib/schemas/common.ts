import { z } from 'zod';

import { ICON_KEYS } from '@/lib/api/types';
import { checkUrl, FONT_FAMILY_RE, HEX6_RE, URL_MAX_LENGTH } from '@/lib/security/safe-url';

/** Limits mirrored from the API so admins get instant feedback instead of a 400. */
export const TITLE_MAX = 300;
export const BODY_MAX = 5000;
export const PAGE_MAX = 200_000;
export const URL_MAX = URL_MAX_LENGTH;

/** Strict `#RRGGBB` (what the theme and onboarding colours accept). */
export const HEX_COLOR_RE = HEX6_RE;
export const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const requiredString = (label = 'This field') => z.string().trim().min(1, `${label} is required`);

/** Short user-facing text (titles, labels, subjects): ≤ 300 characters. */
export const titleText = (label = 'Title', max = TITLE_MAX) =>
  requiredString(label).max(max, `${label} must be ${max} characters or fewer`);
export const optionalTitleText = (label = 'Text', max = TITLE_MAX) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`);
/** Longer user-facing text (descriptions, bodies, answers): ≤ 5000 characters. */
export const bodyText = (label = 'Text', max = BODY_MAX) =>
  z.string().max(max, `${label} must be ${max.toLocaleString('en-US')} characters or fewer`);

export const hexColor = z.string().trim().regex(HEX_COLOR_RE, 'Use a 6-digit hex colour like #5B4FE9');

export const fontFamily = z
  .string()
  .trim()
  .regex(FONT_FAMILY_RE, 'Use a font family name: letters, numbers, spaces and hyphens (max 64 characters)');

function urlIssue(kind: 'link' | 'image', absoluteOnly = false) {
  return (value: string, ctx: z.RefinementCtx) => {
    const check = checkUrl(value, kind);
    if (!check.ok) {
      ctx.addIssue({ code: 'custom', message: check.reason });
      return;
    }
    if (absoluteOnly && check.kind !== 'web') {
      ctx.addIssue({ code: 'custom', message: 'Use a full https:// URL' });
    }
  };
}

/** Image URL: https (http only in development) or a root-relative path. */
export const imageUrl = z.string().trim().min(1, 'Image URL is required').superRefine(urlIssue('image'));
export const nullableImageUrl = z.string().trim().superRefine(urlIssue('image')).nullable();
/** Absolute image URL only (settings the API validates as full URLs: branding logos, OG image). */
export const absoluteImageUrl = z.string().trim().min(1, 'Image URL is required').superRefine(urlIssue('image', true));

/** Absolute web URL or empty string (e.g. iosStoreUrl is "" until the iOS app ships). */
export const optionalHttpUrl = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (value !== '') urlIssue('link', true)(value, ctx);
  });

/**
 * A link target: app path ("/pricing", "/#features"), https URL, mailto:, or a remi:// deep link.
 * javascript:, data:, protocol-relative and whitespace-smuggled URLs are rejected.
 */
export const href = z.string().trim().min(1, 'Link is required').superRefine(urlIssue('link'));
export const nullableHref = z.string().trim().superRefine(urlIssue('link')).nullable();

/** Mobile tab / route names (no scheme or slash): letters, digits, -, _. */
export const routeName = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_-]{0,63}$/i, 'Use a route name such as home, meetings or profile');

export const email = z.email('Enter a valid email address').max(254, 'Email is too long');

export const semver = z.string().trim().regex(SEMVER_RE, 'Use semantic versioning, e.g. 1.4.0');

export const slug = z
  .string()
  .trim()
  .min(1, 'Slug is required')
  .max(80, 'Keep the slug under 80 characters')
  .regex(SLUG_RE, 'Lowercase letters, numbers and single hyphens only (e.g. privacy-policy)');

export const iconKey = z.enum(ICON_KEYS);

export const nullableText = z.string().nullable();

export const intRange = (min: number, max: number, label = 'Value') =>
  z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

/** Compare two semver strings (pre-release suffixes ignored). */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(/[-+]/)[0]?.split('.').map(Number) ?? [];
  const pb = b.split(/[-+]/)[0]?.split('.').map(Number) ?? [];
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
