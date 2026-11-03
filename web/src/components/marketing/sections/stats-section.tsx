import type { SectionContent } from "@/lib/api/types";
import { SectionShell } from "./section-shell";

export function StatsSection({ content }: { content: SectionContent["stats"] }) {
  if (!content.items?.length) return null;
  return (
    <SectionShell className="py-12 sm:py-16">
      <dl className="grid divide-y overflow-hidden rounded-[calc(var(--radius)*2)] border bg-gradient-to-br from-brand-soft via-background to-background sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {content.items.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center gap-1 px-6 py-8 text-center">
            <dt className="order-2 text-sm text-muted-foreground">{stat.label}</dt>
            <dd className="order-1 text-4xl font-semibold tracking-tight text-primary sm:text-5xl">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </SectionShell>
  );
}
