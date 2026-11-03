import type { Priority } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const STYLE: Record<Priority, string> = {
  high: "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300",
  medium: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300",
  low: "bg-muted text-muted-foreground ring-border",
};

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset", STYLE[priority] ?? STYLE.low, className)}>
      {priority}
    </span>
  );
}
