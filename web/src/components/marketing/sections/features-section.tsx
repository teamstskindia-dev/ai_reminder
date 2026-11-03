import { SafeImage } from "@/components/brand/safe-image";
import type { SectionContent } from "@/lib/api/types";
import { DynamicIcon } from "@/lib/icons";
import { SectionHeading, SectionShell } from "./section-shell";

export function FeaturesSection({ content }: { content: SectionContent["features"] }) {
  return (
    <SectionShell id="features">
      <SectionHeading eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} />
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {content.items?.map((item) => (
          <article
            key={item.title}
            className="group relative flex flex-col gap-4 overflow-hidden rounded-[calc(var(--radius)*1.6)] border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
          >
            {item.imageUrl && (
              <SafeImage src={item.imageUrl} alt="" className="-mx-6 -mt-6 mb-2 aspect-[16/9] w-[calc(100%+3rem)] max-w-none object-cover" />
            )}
            <div className="grid size-11 place-items-center rounded-[var(--radius)] bg-brand-soft text-primary ring-1 ring-primary/10 transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <DynamicIcon icon={item.icon} className="size-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold tracking-tight">{item.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
