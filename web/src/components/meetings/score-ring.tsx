import { scoreTone } from "@/lib/meeting";
import { cn } from "@/lib/utils";

const TONE_STROKE = {
  good: "var(--primary)",
  ok: "var(--chart-3)",
  poor: "var(--destructive)",
  none: "var(--muted-foreground)",
} as const;

/** Circular 0–100 score (meeting score). Renders "—" when the score is unknown. */
export function ScoreRing({
  score,
  size = 44,
  strokeWidth = 4,
  label,
  className,
  showLabel = false,
}: {
  score: number | null | undefined;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
  showLabel?: boolean;
}) {
  const value = score == null ? null : Math.max(0, Math.min(100, Math.round(score)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = value == null ? circumference : circumference * (1 - value / 100);
  const tone = scoreTone(value);
  const fontSize = size >= 80 ? "text-2xl" : size >= 56 ? "text-base" : "text-xs";

  return (
    <div className={cn("inline-flex flex-col items-center gap-1", className)}>
      <div
        className="relative grid place-items-center"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${label ?? "Meeting score"}: ${value == null ? "not available" : `${value} out of 100`}`}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            stroke={TONE_STROKE[tone]}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <span className={cn("absolute font-semibold tabular-nums", fontSize, value == null && "text-muted-foreground")}>
          {value ?? "—"}
        </span>
      </div>
      {showLabel && label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}
