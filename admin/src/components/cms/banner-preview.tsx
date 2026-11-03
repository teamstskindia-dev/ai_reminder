'use client';

import { ArrowRight, Info, Megaphone, CircleCheck, TriangleAlert, X } from 'lucide-react';

import { RemoteImage } from '@/components/common/remote-image';
import { themeVars, usePreviewTheme } from '@/components/previews/use-preview-config';
import type { BannerPlacement, BannerVariant } from '@/lib/api/types';
import { cn } from '@/lib/utils';

export interface BannerPreviewData {
  variant: BannerVariant;
  placement: BannerPlacement;
  title: string;
  body: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
}

const VARIANT_STYLES: Record<Exclude<BannerVariant, 'promo'>, { box: string; icon: typeof Info }> = {
  info: { box: 'border-sky-200 bg-sky-50 text-sky-950', icon: Info },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-950', icon: CircleCheck },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-950', icon: TriangleAlert },
};

/**
 * Lightweight rendering of a banner the way web/mobile show it, using the saved brand theme.
 * Not pixel-exact — it is meant to catch copy, variant and image mistakes before publishing.
 */
export function BannerPreview({ banner, className }: { banner: BannerPreviewData; className?: string }) {
  const theme = usePreviewTheme();
  const promo = banner.variant === 'promo';
  const style = banner.variant === 'promo' ? null : VARIANT_STYLES[banner.variant];
  const Icon = promo ? Megaphone : (style?.icon ?? Info);
  const title = banner.title || 'Banner title';
  const isStrip = banner.placement === 'landing_top';
  const isMobile = banner.placement === 'mobile_home';

  const cta = banner.ctaLabel ? (
    <span
      className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1 text-[11px] font-medium"
      style={
        promo
          ? { background: 'var(--pv-primary-fg)', color: 'var(--pv-primary)', borderRadius: 'var(--pv-radius)' }
          : { background: 'var(--pv-primary)', color: 'var(--pv-primary-fg)', borderRadius: 'var(--pv-radius)' }
      }
    >
      {banner.ctaLabel} <ArrowRight className="size-3" aria-hidden />
    </span>
  ) : null;

  const boxStyle = promo
    ? {
        background: 'linear-gradient(120deg, var(--pv-primary), var(--pv-accent))',
        color: 'var(--pv-primary-fg)',
        borderRadius: isStrip ? 0 : 'var(--pv-radius)',
      }
    : { borderRadius: isStrip ? 0 : 'var(--pv-radius)' };

  if (isStrip) {
    return (
      <div className={cn('overflow-hidden rounded-md border bg-white', className)} style={themeVars(theme)}>
        <div className={cn('flex items-center justify-center gap-2 px-3 py-1.5 text-xs', style?.box)} style={boxStyle}>
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate font-medium">{title}</span>
          {banner.ctaLabel ? <span className="shrink-0 underline underline-offset-2">{banner.ctaLabel}</span> : null}
        </div>
        <div className="flex items-center justify-between px-3 py-2 text-[10px] text-neutral-400">
          <span className="font-semibold text-neutral-700">Logo</span>
          <span>Features · Pricing</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(isMobile && 'mx-auto w-full max-w-[260px] rounded-[1.4rem] border-4 border-neutral-800 bg-neutral-50 p-2', className)}
      style={themeVars(theme)}
    >
      {isMobile ? <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-neutral-300" aria-hidden /> : null}
      <div className={cn('relative flex gap-3 overflow-hidden border p-3', style?.box, isMobile && 'flex-col')} style={boxStyle}>
        {banner.imageUrl ? (
          <RemoteImage
            src={banner.imageUrl}
            alt=""
            className={cn('shrink-0 rounded-md', isMobile ? 'h-20 w-full' : 'size-14')}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start gap-1.5">
            {!banner.imageUrl ? <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : null}
            <p className="text-sm leading-tight font-semibold">{title}</p>
          </div>
          {banner.body ? <p className="line-clamp-3 text-xs opacity-85">{banner.body}</p> : null}
          {cta ? <div className="pt-1">{cta}</div> : null}
        </div>
        {!isMobile ? <X className="absolute top-2 right-2 size-3 opacity-50" aria-hidden /> : null}
      </div>
    </div>
  );
}
