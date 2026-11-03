"use client";

import { ArrowRight, CheckCircle2, Info, Megaphone, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { SafeImage } from "@/components/brand/safe-image";
import { SmartLink } from "@/components/common/smart-link";
import { Button } from "@/components/ui/button";
import type { Banner, BannerVariant } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "remi-dismissed-banners";

const VARIANT: Record<BannerVariant, { icon: typeof Info; className: string; iconClass: string }> = {
  info: { icon: Info, className: "border-sky-500/25 bg-sky-500/[0.06]", iconClass: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
  success: { icon: CheckCircle2, className: "border-emerald-500/25 bg-emerald-500/[0.06]", iconClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  warning: { icon: TriangleAlert, className: "border-amber-500/30 bg-amber-500/[0.07]", iconClass: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  promo: { icon: Megaphone, className: "border-primary/25 bg-gradient-to-r from-brand-soft to-card", iconClass: "bg-primary text-primary-foreground" },
};

function readDismissed(): string[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** `dashboard` banners from the admin panel; dismissals last for the browser session. */
export function DashboardBanners({ banners }: { banners: Banner[] }) {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const visible = banners.filter((b) => !dismissed.includes(b.id));
  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — dismissal lasts until reload */
    }
  };

  return (
    <div className="space-y-3">
      {visible.map((banner) => {
        const meta = VARIANT[banner.variant] ?? VARIANT.info;
        const Icon = meta.icon;
        return (
          <div key={banner.id} role="status" className={cn("relative flex flex-col gap-4 overflow-hidden rounded-xl border p-4 pr-12 sm:flex-row sm:items-center sm:p-5 sm:pr-14", meta.className)}>
            <div className="flex flex-1 items-start gap-3.5">
              <SafeImage
                src={banner.imageUrl}
                alt=""
                className="size-10 shrink-0 rounded-lg object-cover"
                fallback={
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", meta.iconClass)}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                }
              />
              <div className="space-y-0.5">
                <p className="font-medium">{banner.title}</p>
                {banner.body && <p className="text-sm text-muted-foreground">{banner.body}</p>}
              </div>
            </div>
            {banner.ctaUrl && (
              <Button asChild size="sm" variant={banner.variant === "promo" ? "default" : "outline"} className="self-start sm:self-auto">
                <SmartLink href={banner.ctaUrl}>
                  {banner.ctaLabel || "Learn more"} <ArrowRight data-icon="inline-end" />
                </SmartLink>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => dismiss(banner.id)}
              aria-label={`Dismiss “${banner.title}”`}
              className="absolute top-3 right-3"
            >
              <X />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
