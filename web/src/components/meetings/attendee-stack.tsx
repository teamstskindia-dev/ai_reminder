import { Users } from "lucide-react";
import type { Attendee } from "@/lib/api/types";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
];

export function colorFor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** Overlapping initials for attendees, or a people icon + count when only the count is known. */
export function AttendeeStack({
  attendees,
  count,
  max = 4,
  className,
}: {
  attendees?: Attendee[];
  count: number;
  max?: number;
  className?: string;
}) {
  if (!attendees?.length) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)} title={`${count} attendees`}>
        <Users className="size-3.5" aria-hidden="true" />
        {count}
      </span>
    );
  }
  const shown = attendees.slice(0, max);
  const extra = Math.max(count, attendees.length) - shown.length;
  return (
    <span className={cn("flex items-center -space-x-2", className)}>
      {shown.map((a) => (
        <span
          key={a.email}
          title={a.name ?? a.email}
          className={cn("grid size-7 place-items-center rounded-full text-[10px] font-semibold tracking-tight ring-2 ring-card", colorFor(a.email))}
        >
          {initials(a.name, a.email)}
        </span>
      ))}
      {extra > 0 && (
        <span className="grid size-7 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
          +{extra}
        </span>
      )}
    </span>
  );
}
