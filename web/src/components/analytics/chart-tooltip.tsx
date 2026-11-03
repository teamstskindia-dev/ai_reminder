"use client";

import type { ReactNode } from "react";

interface Payload {
  value?: number | string | null;
  name?: string;
  color?: string;
  payload?: Record<string, unknown>;
}

/** Recharts tooltip body styled with app tokens (text never wears the series colour). */
export function ChartTooltip({
  active,
  payload,
  label,
  formatLabel,
  formatValue,
}: {
  active?: boolean;
  payload?: Payload[];
  label?: string | number;
  formatLabel?: (label: string | number | undefined, payload?: Record<string, unknown>) => ReactNode;
  formatValue?: (value: number | string | null | undefined, name?: string) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-32 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{formatLabel ? formatLabel(label, payload[0]?.payload) : label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center justify-between gap-3 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: entry.color }} aria-hidden="true" />
            {entry.name}
          </span>
          <span className="font-medium text-foreground tabular-nums">{formatValue ? formatValue(entry.value, entry.name) : entry.value}</span>
        </p>
      ))}
    </div>
  );
}
