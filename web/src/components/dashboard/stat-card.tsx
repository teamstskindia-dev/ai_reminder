import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p>
      {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
    </div>
  );
}
