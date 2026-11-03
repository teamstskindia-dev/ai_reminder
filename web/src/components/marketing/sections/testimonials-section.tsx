import { Quote } from "lucide-react";
import { SafeImage } from "@/components/brand/safe-image";
import type { SectionContent } from "@/lib/api/types";
import { SectionHeading, SectionShell } from "./section-shell";

function AvatarFallback({ name }: { name: string }) {
  const letters = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="grid size-11 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-soft-foreground">
      {letters}
    </span>
  );
}

export function TestimonialsSection({ content }: { content: SectionContent["testimonials"] }) {
  return (
    <SectionShell>
      <SectionHeading title={content.title} />
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {content.items?.map((item) => (
          <figure key={item.name} className="flex flex-col justify-between gap-6 rounded-[calc(var(--radius)*1.6)] border bg-card p-6 shadow-sm">
            <blockquote className="space-y-3">
              <Quote className="size-6 text-primary/40" aria-hidden="true" />
              <p className="leading-relaxed text-pretty">{item.quote}</p>
            </blockquote>
            <figcaption className="flex items-center gap-3">
              <SafeImage
                src={item.avatarUrl}
                alt=""
                className="size-11 rounded-full object-cover ring-2 ring-background"
                fallback={<AvatarFallback name={item.name} />}
              />
              <div>
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="text-sm text-muted-foreground">{item.role}</p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </SectionShell>
  );
}
