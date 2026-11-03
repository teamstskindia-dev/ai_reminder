import type { SectionContent } from "@/lib/api/types";
import { SectionHeading, SectionShell } from "./section-shell";

export function StepsSection({ content }: { content: SectionContent["steps"] }) {
  return (
    <SectionShell id="how-it-works" className="bg-surface">
      <SectionHeading title={content.title} subtitle={content.subtitle} />
      <ol className="relative mt-14 grid gap-8 md:grid-cols-3 md:gap-6">
        <div aria-hidden="true" className="absolute top-6 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-primary/10 via-primary/40 to-primary/10 md:block" />
        {content.items?.map((step, index) => (
          <li key={step.title} className="relative flex flex-col items-center gap-4 text-center">
            <span className="relative grid size-12 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground shadow-lg ring-8 shadow-primary/30 ring-surface">
              {index + 1}
            </span>
            <div className="max-w-xs space-y-2">
              <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </SectionShell>
  );
}
