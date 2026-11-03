import { ArrowRight, Sparkles } from "lucide-react";
import { SmartLink } from "@/components/common/smart-link";
import type { Banner } from "@/lib/api/types";

/** Thin announcement bar for `landing_top` banners. */
export function BannerStrip({ banners }: { banners: Banner[] }) {
  if (banners.length === 0) return null;
  return (
    <div className="border-b bg-brand-soft text-brand-soft-foreground">
      {banners.map((banner) => (
        <div
          key={banner.id}
          className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm"
        >
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {banner.title}
          </span>
          {banner.body && <span className="text-brand-soft-foreground/80">{banner.body}</span>}
          {banner.ctaUrl && (
            <SmartLink href={banner.ctaUrl} className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
              {banner.ctaLabel || "Learn more"}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </SmartLink>
          )}
        </div>
      ))}
    </div>
  );
}
