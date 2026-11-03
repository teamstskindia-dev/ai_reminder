'use client';

import { Check, ChevronDown, Quote } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { Markdown } from '@/components/common/markdown';
import { RemoteImage } from '@/components/common/remote-image';
import { IconPreview } from '@/components/forms/icon-select';
import { GoogleFontLink } from '@/components/previews/google-font';
import { themeVars, usePreviewBranding, usePreviewTheme } from '@/components/previews/use-preview-config';
import { usePlans } from '@/lib/api/plans';
import type { SectionContent, SectionType } from '@/lib/api/types';
import { cn, formatCurrency, initials } from '@/lib/utils';
import { safeColor } from '@/lib/security/safe-url';

/** Previews always render on a light "website" surface, whatever the admin's own colour mode. */
const LIGHT_SURFACE = {
  colorScheme: 'light',
  '--foreground': 'oklch(0.145 0 0)',
  '--muted': 'oklch(0.97 0 0)',
  '--muted-foreground': 'oklch(0.556 0 0)',
  '--border': 'oklch(0.922 0 0)',
} as CSSProperties;

const primaryButton: CSSProperties = {
  background: 'var(--pv-primary)',
  color: 'var(--pv-primary-fg)',
  borderRadius: 'var(--pv-radius)',
};

const outlineButton: CSSProperties = {
  border: '1px solid #d4d4d8',
  color: '#18181b',
  borderRadius: 'var(--pv-radius)',
};

const tint = (variable: string, percent: number): string =>
  `color-mix(in srgb, var(${variable}) ${percent}%, transparent)`;

function Heading({ eyebrow, title, subtitle }: { eyebrow?: string | null; title?: string | null; subtitle?: string | null }) {
  if (!eyebrow && !title && !subtitle) return null;
  return (
    <div className="mb-4 space-y-1 text-center">
      {eyebrow ? (
        <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: 'var(--pv-primary)' }}>
          {eyebrow}
        </p>
      ) : null}
      {title ? <h3 className="text-base leading-tight font-bold text-balance">{title}</h3> : null}
      {subtitle ? <p className="mx-auto max-w-sm text-xs text-neutral-500">{subtitle}</p> : null}
    </div>
  );
}

function HeroPreview({ content }: { content: SectionContent['hero'] }) {
  return (
    <div className="space-y-3 px-5 py-6 text-center">
      {content.eyebrow ? (
        <span
          className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium"
          style={{ background: tint('--pv-primary', 12), color: 'var(--pv-primary)' }}
        >
          {content.eyebrow}
        </span>
      ) : null}
      <h3 className="text-lg leading-tight font-bold text-balance">{content.title || 'Headline'}</h3>
      {content.subtitle ? <p className="mx-auto max-w-sm text-xs text-neutral-500">{content.subtitle}</p> : null}
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <span className="px-3 py-1.5 text-[11px] font-medium" style={primaryButton}>
          {content.primaryCta?.label || 'Primary'}
        </span>
        {content.secondaryCta ? (
          <span className="px-3 py-1.5 text-[11px] font-medium" style={outlineButton}>
            {content.secondaryCta.label || 'Secondary'}
          </span>
        ) : null}
      </div>
      {content.badges?.length ? (
        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-neutral-500">
          {content.badges.map((badge, i) => (
            <li key={`${badge}-${i}`} className="inline-flex items-center gap-1">
              <Check className="size-3" style={{ color: 'var(--pv-accent)' }} aria-hidden /> {badge}
            </li>
          ))}
        </ul>
      ) : null}
      {content.imageUrl ? (
        <RemoteImage
          src={content.imageUrl}
          alt=""
          className="mt-2 h-32 w-full"
          rounded
        />
      ) : null}
    </div>
  );
}

function LogosPreview({ content }: { content: SectionContent['logos'] }) {
  return (
    <div className="px-5 py-5">
      {content.title ? (
        <p className="mb-3 text-center text-[10px] font-medium tracking-wide text-neutral-500 uppercase">{content.title}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {(content.items ?? []).map((logo, i) => (
          <RemoteImage
            key={`${logo.name}-${i}`}
            src={logo.imageUrl}
            alt={logo.name}
            fit="contain"
            className="h-6 w-20"
            fallback={<span className="text-xs font-semibold text-neutral-400">{logo.name || 'Logo'}</span>}
          />
        ))}
        {(content.items ?? []).length === 0 ? <span className="text-xs text-neutral-400">No logos yet</span> : null}
      </div>
    </div>
  );
}

function FeaturesPreview({ content }: { content: SectionContent['features'] }) {
  return (
    <div className="px-5 py-6">
      <Heading eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} />
      <div className="grid gap-2 @xs:grid-cols-2">
        {(content.items ?? []).map((item, i) => (
          <div key={i} className="space-y-1.5 border border-neutral-200 p-2.5" style={{ borderRadius: 'var(--pv-radius)' }}>
            <span
              className="flex size-6 items-center justify-center"
              style={{ background: tint('--pv-primary', 12), color: 'var(--pv-primary)', borderRadius: 'calc(var(--pv-radius) * 0.6)' }}
            >
              <IconPreview icon={item.icon} className="size-3.5" />
            </span>
            <p className="text-xs font-semibold">{item.title || 'Feature'}</p>
            <p className="line-clamp-3 text-[10px] text-neutral-500">{item.description}</p>
            {item.imageUrl ? <RemoteImage src={item.imageUrl} alt="" className="h-14 w-full" rounded /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepsPreview({ content }: { content: SectionContent['steps'] }) {
  return (
    <div className="px-5 py-6">
      <Heading title={content.title} subtitle={content.subtitle} />
      <ol className="grid gap-3 @xs:grid-cols-3">
        {(content.items ?? []).map((step, i) => (
          <li key={i} className="space-y-1 text-center">
            <span
              className="mx-auto flex size-6 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ background: 'var(--pv-primary)', color: 'var(--pv-primary-fg)' }}
            >
              {i + 1}
            </span>
            <p className="text-xs font-semibold">{step.title || 'Step'}</p>
            <p className="text-[10px] text-neutral-500">{step.description}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StatsPreview({ content }: { content: SectionContent['stats'] }) {
  return (
    <div className="grid gap-3 px-5 py-6 @xs:grid-cols-3" style={{ background: tint('--pv-primary', 6) }}>
      {(content.items ?? []).map((stat, i) => (
        <div key={i} className="text-center">
          <p className="text-xl font-bold" style={{ color: 'var(--pv-primary)' }}>
            {stat.value || '—'}
          </p>
          <p className="text-[10px] text-neutral-500">{stat.label}</p>
        </div>
      ))}
      {(content.items ?? []).length === 0 ? <p className="text-center text-xs text-neutral-400">No stats yet</p> : null}
    </div>
  );
}

function TestimonialsPreview({ content }: { content: SectionContent['testimonials'] }) {
  return (
    <div className="px-5 py-6">
      <Heading title={content.title} />
      <div className="grid gap-2 @sm:grid-cols-2">
        {(content.items ?? []).map((t, i) => (
          <figure key={i} className="space-y-2 border border-neutral-200 p-3" style={{ borderRadius: 'var(--pv-radius)' }}>
            <Quote className="size-3.5" style={{ color: 'var(--pv-accent)' }} aria-hidden />
            <blockquote className="line-clamp-4 text-[11px]">{t.quote || 'Quote'}</blockquote>
            <figcaption className="flex items-center gap-2">
              <RemoteImage
                src={t.avatarUrl}
                alt=""
                className="size-6 rounded-full"
                fallback={
                  <span className="flex size-full items-center justify-center bg-neutral-200 text-[9px] font-semibold text-neutral-600">
                    {initials(t.name)}
                  </span>
                }
              />
              <span className="min-w-0 text-[10px] leading-tight">
                <span className="block truncate font-semibold">{t.name || 'Name'}</span>
                <span className="block truncate text-neutral-500">{t.role}</span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function PricingPreview({ content }: { content: SectionContent['pricing'] }) {
  const plans = usePlans();
  const active = (plans.data ?? []).filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 3);
  return (
    <div className="px-5 py-6">
      <Heading title={content.title} subtitle={content.subtitle} />
      <div className="grid gap-2 @xs:grid-cols-3">
        {active.length
          ? active.map((plan) => (
              <div
                key={plan.id}
                className="space-y-1 border p-2.5 text-center"
                style={{
                  borderRadius: 'var(--pv-radius)',
                  borderColor: plan.isPopular ? 'var(--pv-primary)' : '#e4e4e7',
                }}
              >
                <p className="text-[11px] font-semibold">{plan.name}</p>
                <p className="text-sm font-bold">{formatCurrency(plan.priceMonthly, plan.currency)}</p>
                <p className="text-[9px] text-neutral-500">per month</p>
              </div>
            ))
          : Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="flex h-20 items-center justify-center border border-dashed border-neutral-300 p-2 text-center text-[10px] text-neutral-400"
                style={{ borderRadius: 'var(--pv-radius)' }}
              >
                Plan card
              </div>
            ))}
      </div>
      <p className="mt-3 text-center text-[10px] text-neutral-400">Plans from Content → Plans</p>
    </div>
  );
}

function FaqPreview({ content }: { content: SectionContent['faq'] }) {
  return (
    <div className="px-5 py-6">
      <Heading title={content.title} />
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
        {(content.items ?? []).map((item, i) => (
          <li key={i} className="py-2">
            <p className="flex items-center justify-between gap-2 text-xs font-medium">
              {item.question || 'Question'}
              <ChevronDown className={cn('size-3.5 shrink-0 text-neutral-400', i === 0 && 'rotate-180')} aria-hidden />
            </p>
            {i === 0 ? <p className="mt-1 text-[11px] text-neutral-500">{item.answer}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CtaPreview({ content }: { content: SectionContent['cta'] }) {
  return (
    <div className="p-4">
      <div
        className="space-y-2 px-5 py-6 text-center"
        style={{ background: 'var(--pv-primary)', color: 'var(--pv-primary-fg)', borderRadius: 'var(--pv-radius)' }}
      >
        <h3 className="text-base leading-tight font-bold text-balance">{content.title || 'Call to action'}</h3>
        {content.subtitle ? <p className="text-xs opacity-80">{content.subtitle}</p> : null}
        <span
          className="inline-block px-3 py-1.5 text-[11px] font-semibold"
          style={{ background: 'var(--pv-primary-fg)', color: 'var(--pv-primary)', borderRadius: 'var(--pv-radius)' }}
        >
          {content.cta?.label || 'Button'}
        </span>
      </div>
    </div>
  );
}

function RichTextPreview({ content }: { content: SectionContent['rich_text'] }) {
  return (
    <div className="px-5 py-5">
      {content.markdown?.trim() ? (
        <Markdown className="text-xs text-neutral-900">{content.markdown}</Markdown>
      ) : (
        <p className="text-xs text-neutral-400">Empty</p>
      )}
    </div>
  );
}

function OnboardingSlidePreview({ content }: { content: SectionContent['onboarding_slide'] }) {
  return (
    <div className="flex h-full flex-col px-5 pt-8 pb-5" style={{ background: safeColor(content.backgroundColor, '#FFFFFF') }}>
      <div className="flex flex-1 items-center justify-center">
        <RemoteImage src={content.imageUrl} alt="" className="aspect-square w-full" rounded />
      </div>
      <div className="space-y-1.5 pt-5 text-center">
        <h3 className="text-base leading-tight font-bold">{content.title || 'Slide title'}</h3>
        <p className="text-[11px] text-neutral-600">{content.description}</p>
      </div>
      <div className="mt-4 flex justify-center gap-1" aria-hidden>
        <span className="h-1.5 w-4 rounded-full" style={{ background: 'var(--pv-primary)' }} />
        <span className="size-1.5 rounded-full bg-neutral-300" />
        <span className="size-1.5 rounded-full bg-neutral-300" />
      </div>
      <span className="mt-4 block py-2 text-center text-[11px] font-semibold" style={primaryButton}>
        Next
      </span>
    </div>
  );
}

function BrowserFrame({ children }: { children: ReactNode }) {
  const branding = usePreviewBranding();
  return (
    <div className="overflow-hidden rounded-lg border bg-white text-neutral-900 shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-neutral-100 px-3 py-2">
        <span className="size-2 rounded-full bg-red-400" />
        <span className="size-2 rounded-full bg-amber-400" />
        <span className="size-2 rounded-full bg-emerald-400" />
        <span className="ml-2 truncate text-[10px] text-neutral-500">{branding.appName}</span>
      </div>
      <div className="@container">{children}</div>
    </div>
  );
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-[240px] rounded-[2.2rem] border-[7px] border-neutral-900 bg-neutral-900 shadow-lg">
      <div className="relative h-[460px] overflow-hidden rounded-[1.7rem] bg-white text-neutral-900">
        <div className="absolute top-1.5 left-1/2 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-neutral-900" aria-hidden />
        <div className="@container h-full overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function PreviewBody({ type, content }: { type: SectionType; content: SectionContent[SectionType] }) {
  switch (type) {
    case 'hero':
      return <HeroPreview content={content as SectionContent['hero']} />;
    case 'logos':
      return <LogosPreview content={content as SectionContent['logos']} />;
    case 'features':
      return <FeaturesPreview content={content as SectionContent['features']} />;
    case 'steps':
      return <StepsPreview content={content as SectionContent['steps']} />;
    case 'stats':
      return <StatsPreview content={content as SectionContent['stats']} />;
    case 'testimonials':
      return <TestimonialsPreview content={content as SectionContent['testimonials']} />;
    case 'pricing':
      return <PricingPreview content={content as SectionContent['pricing']} />;
    case 'faq':
      return <FaqPreview content={content as SectionContent['faq']} />;
    case 'cta':
      return <CtaPreview content={content as SectionContent['cta']} />;
    case 'rich_text':
      return <RichTextPreview content={content as SectionContent['rich_text']} />;
    case 'onboarding_slide':
      return <OnboardingSlidePreview content={content as SectionContent['onboarding_slide']} />;
    default:
      return null;
  }
}

/**
 * Lightweight approximation of how a section renders on the website (browser frame) or in the Android app
 * (phone frame), using the saved brand theme.
 */
export function SectionPreview({
  type,
  content,
  page,
}: {
  type: SectionType;
  content: SectionContent[SectionType] | undefined;
  page: string;
}) {
  const theme = usePreviewTheme();
  const phone = page.startsWith('mobile') || type === 'onboarding_slide';
  if (!content) return null;
  const body = <PreviewBody type={type} content={content} />;
  return (
    <div style={{ ...themeVars(theme), ...LIGHT_SURFACE }}>
      <GoogleFontLink family={theme.fontFamily} />
      {phone ? <PhoneFrame>{body}</PhoneFrame> : <BrowserFrame>{body}</BrowserFrame>}
    </div>
  );
}
