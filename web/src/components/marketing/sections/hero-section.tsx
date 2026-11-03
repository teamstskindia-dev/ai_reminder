import { CheckCircle2 } from "lucide-react";
import { SafeImage } from "@/components/brand/safe-image";
import type { SectionContent } from "@/lib/api/types";
import { CtaButton } from "./cta-button";

export function HeroSection({ content }: { content: SectionContent["hero"] }) {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Brand glow + grid backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-40 -right-40 h-[360px] w-[480px] rounded-full bg-brand-accent/15 blur-3xl" />
      </div>
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-24 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-8">
        <div className="space-y-7">
          {content.eyebrow && (
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-brand-soft px-3 py-1 text-xs font-semibold tracking-wide text-brand-soft-foreground uppercase">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              {content.eyebrow}
            </span>
          )}
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl lg:leading-[1.05]">
            {content.title}
          </h1>
          {content.subtitle && (
            <p className="max-w-xl text-lg text-pretty text-muted-foreground sm:text-xl">{content.subtitle}</p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <CtaButton cta={content.primaryCta} arrow className="shadow-lg shadow-primary/25" />
            <CtaButton cta={content.secondaryCta} variant="outline" />
          </div>
          {content.badges?.length > 0 && (
            <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
              {content.badges.map((badge) => (
                <li key={badge} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-brand-accent" aria-hidden="true" />
                  {badge}
                </li>
              ))}
            </ul>
          )}
        </div>
        {content.imageUrl && (
          <div className="relative">
            <div aria-hidden="true" className="absolute -inset-4 -z-10 rounded-[calc(var(--radius)*3)] bg-gradient-to-tr from-primary/25 via-transparent to-brand-accent/25 blur-2xl" />
            <div className="overflow-hidden rounded-[calc(var(--radius)*2)] border bg-card shadow-2xl shadow-primary/10">
              <div className="flex items-center gap-1.5 border-b bg-muted/60 px-4 py-2.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-foreground/15" />
                <span className="size-2.5 rounded-full bg-foreground/15" />
                <span className="size-2.5 rounded-full bg-foreground/15" />
                <span className="ml-3 h-4 w-40 rounded-full bg-foreground/10" />
              </div>
              <SafeImage
                src={content.imageUrl}
                alt=""
                className="aspect-[16/10] w-full object-cover"
                fallback={<div className="aspect-[16/10] w-full bg-gradient-to-br from-primary/30 to-brand-accent/30" />}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
