import { cn } from "@/lib/utils";

/** Ranked horizontal bars (one hue, largest first) with the value printed at the tip. */
export function RankedBars({
  items,
  formatValue = (v) => String(v),
  className,
}: {
  items: { label: string; value: number; hint?: string }[];
  formatValue?: (value: number) => string;
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
          <span className="truncate text-sm" title={item.hint ? `${item.label} · ${item.hint}` : item.label}>
            {item.label}
          </span>
          <span className="flex items-center gap-2" title={`${item.label}: ${formatValue(item.value)}${item.hint ? ` · ${item.hint}` : ""}`}>
            <span className="relative h-3.5 flex-1" aria-hidden="true">
              <span
                className="absolute inset-y-0 left-0 rounded-r-[4px] bg-primary transition-[width] duration-500"
                style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
              />
            </span>
            <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{formatValue(item.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
