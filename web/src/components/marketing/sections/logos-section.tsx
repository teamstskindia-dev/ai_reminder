import { SafeImage } from "@/components/brand/safe-image";
import type { SectionContent } from "@/lib/api/types";

export function LogosSection({ content }: { content: SectionContent["logos"] }) {
  if (!content.items?.length) return null;
  return (
    <section className="border-y bg-surface/60 py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {content.title && (
          <p className="text-center text-sm font-medium text-muted-foreground">{content.title}</p>
        )}
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 sm:gap-x-14">
          {content.items.map((logo) => (
            <li key={logo.name} className="opacity-70 grayscale transition hover:opacity-100 dark:invert-[0.15]">
              <SafeImage
                src={logo.imageUrl}
                alt={logo.name}
                className="h-8 w-auto max-w-[140px] object-contain"
                fallback={<span className="text-lg font-semibold tracking-tight text-muted-foreground">{logo.name}</span>}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
