import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionShell({
  id,
  children,
  className,
  innerClassName,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20 py-16 sm:py-24", className)}>
      <div className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", innerClassName)}>{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
}: {
  eyebrow?: string | null;
  title: string;
  subtitle?: string | null;
  align?: "center" | "left";
}) {
  return (
    <div className={cn("max-w-2xl space-y-4", align === "center" && "mx-auto text-center")}>
      {eyebrow && <p className="text-sm font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>}
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle && <p className="text-lg text-pretty text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
