import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** White card with a title row and optional "View all" link, used across the app. */
export function SectionCard({
  title,
  description,
  href,
  hrefLabel = "View all",
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  href?: string;
  hrefLabel?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs", className)}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {href && (
            <Link href={href} className="text-xs font-medium text-primary hover:underline">
              {hrefLabel}
            </Link>
          )}
        </div>
      </header>
      <div className={cn("flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}
