import { Frown, Meh, Smile, Zap } from "lucide-react";
import type { SentimentLabel } from "@/lib/api/types";
import { sentimentFromScore } from "@/lib/meeting";
import { cn } from "@/lib/utils";

const SENTIMENT = {
  positive: { icon: Smile, label: "Positive", className: "text-sentiment-positive" },
  neutral: { icon: Meh, label: "Neutral", className: "text-muted-foreground" },
  negative: { icon: Frown, label: "Negative", className: "text-sentiment-negative" },
} as const;

export function SentimentIndicator({
  label,
  score,
  className,
  showText = true,
}: {
  label: SentimentLabel | null | undefined;
  score?: number | null;
  className?: string;
  showText?: boolean;
}) {
  const resolved = label ?? sentimentFromScore(score);
  if (!resolved) return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  const meta = SENTIMENT[resolved];
  const Icon = meta.icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs font-medium text-foreground/80", className)}
      title={`Sentiment: ${meta.label}${score != null ? ` (${Math.round(score)})` : ""}`}
    >
      <Icon className={cn("size-3.5", meta.className)} aria-hidden="true" />
      {showText ? meta.label : <span className="sr-only">{meta.label}</span>}
    </span>
  );
}

/** Small 0–100 bar meter, e.g. engagement. */
export function MiniMeter({
  value,
  label = "Engagement",
  className,
}: {
  value: number | null | undefined;
  label?: string;
  className?: string;
}) {
  const v = value == null ? null : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)} title={`${label}: ${v ?? "—"}`}>
      <Zap className="size-3.5 text-brand-accent" aria-hidden="true" />
      <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 rounded-full bg-brand-accent" style={{ width: `${v ?? 0}%` }} />
      </span>
      <span className="tabular-nums">{v ?? "—"}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
