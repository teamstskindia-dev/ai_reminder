import { z } from 'zod';
import type { SectionType } from '../../common/types/api.types';
import type { ValidationIssue } from '../../common/errors/app.exception';
import { zHexColor, zHttpsUrl, zSafeUrl } from '../../common/validation/safe-url';

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => text(max).min(1);
const nullable = <T extends z.ZodType>(s: T) => s.nullable();
const icon = z.string().regex(/^[a-z][a-z0-9-]{0,40}$/, 'must be an icon key like "calendar"');
const image = zHttpsUrl();
const cta = z.object({ label: required(60), href: zSafeUrl() }).strict();

/** Content shape per section type (API contract §1 SectionContent). */
export const SECTION_CONTENT_SCHEMAS: Record<SectionType, z.ZodType> = {
  hero: z
    .object({
      eyebrow: nullable(text(80)),
      title: required(200),
      subtitle: text(600),
      primaryCta: cta,
      secondaryCta: nullable(cta),
      imageUrl: nullable(image),
      badges: z.array(required(60)).max(10),
    })
    .strict(),
  logos: z
    .object({ title: text(200), items: z.array(z.object({ name: required(80), imageUrl: image }).strict()).max(40) })
    .strict(),
  features: z
    .object({
      eyebrow: nullable(text(80)),
      title: required(200),
      subtitle: nullable(text(600)),
      items: z
        .array(z.object({ icon, title: required(120), description: text(1000), imageUrl: nullable(image) }).strict())
        .max(24),
    })
    .strict(),
  steps: z
    .object({
      title: required(200),
      subtitle: nullable(text(600)),
      items: z.array(z.object({ title: required(120), description: text(1000) }).strict()).max(12),
    })
    .strict(),
  stats: z
    .object({ items: z.array(z.object({ value: required(40), label: required(120) }).strict()).max(12) })
    .strict(),
  testimonials: z
    .object({
      title: required(200),
      items: z
        .array(
          z.object({ quote: required(1000), name: required(80), role: text(120), avatarUrl: nullable(image) }).strict(),
        )
        .max(24),
    })
    .strict(),
  pricing: z.object({ title: required(200), subtitle: nullable(text(600)) }).strict(),
  faq: z
    .object({
      title: required(200),
      items: z.array(z.object({ question: required(300), answer: required(5000) }).strict()).max(60),
    })
    .strict(),
  cta: z.object({ title: required(200), subtitle: nullable(text(600)), cta }).strict(),
  rich_text: z.object({ markdown: z.string().max(200_000) }).strict(),
  onboarding_slide: z
    .object({
      title: required(120),
      description: text(1000),
      imageUrl: nullable(image),
      backgroundColor: nullable(zHexColor()),
    })
    .strict(),
};

export function validateSectionContent(
  type: SectionType,
  content: unknown,
): { success: true; value: unknown } | { success: false; errors: ValidationIssue[] } {
  const result = SECTION_CONTENT_SCHEMAS[type].safeParse(content);
  if (result.success) return { success: true, value: result.data };
  const byField = new Map<string, string[]>();
  for (const issue of result.error.issues) {
    const field = ['content', ...issue.path.map(String)].join('.');
    byField.set(field, [...(byField.get(field) ?? []), issue.message]);
  }
  return { success: false, errors: [...byField.entries()].map(([field, messages]) => ({ field, messages })) };
}
