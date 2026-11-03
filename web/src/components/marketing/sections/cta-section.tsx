import { ArrowRight } from "lucide-react";
import { SmartLink } from "@/components/common/smart-link";
import { Button } from "@/components/ui/button";
import type { SectionContent } from "@/lib/api/types";
import { SectionShell } from "./section-shell";

export function CtaSection({ content }: { content: SectionContent["cta"] }) {
  return (
    <SectionShell>
      <div className="relative isolate overflow-hidden rounded-[calc(var(--radius)*2.4)] bg-primary px-6 py-14 text-center text-primary-foreground shadow-2xl shadow-primary/25 sm:px-12 sm:py-20">
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <div className="absolute -top-24 -left-24 size-72 rounded-full bg-white/15 blur-3xl" />
          <div className="absolute -right-24 -bottom-24 size-72 rounded-full bg-brand-accent/40 blur-3xl" />
        </div>
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">{content.title}</h2>
        {content.subtitle && <p className="mx-auto mt-4 max-w-xl text-lg opacity-85">{content.subtitle}</p>}
        {content.cta?.href && (
          <Button
            asChild
            size="lg"
            className="mt-8 h-11 bg-primary-foreground px-6 text-[0.95rem] text-primary shadow-lg hover:bg-primary-foreground/90"
          >
            <SmartLink href={content.cta.href}>
              {content.cta.label}
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </SmartLink>
          </Button>
        )}
      </div>
    </SectionShell>
  );
}
