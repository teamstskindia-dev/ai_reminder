import { Gauge, Smile, Zap } from "lucide-react";
import type { MeetingReport } from "@/lib/api/types";
import { scoreTone, sentimentFromScore, SENTIMENT_META } from "@/lib/meeting";
import { cn } from "@/lib/utils";
import { SentimentIndicator } from "../indicators";
import { ScoreRing } from "../score-ring";

const TONE_TEXT = { good: "Great", ok: "Okay", poor: "Needs work", none: "Not scored" } as const;

function Bar({ value, className }: { value: number | null; className: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className={cn("h-full rounded-full transition-[width] duration-700", className)} style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

export function ScoreCards({ report }: { report: MeetingReport }) {
  const engagement = report.engagementScore == null ? null : Math.round(report.engagementScore);
  const sentiment = report.sentimentScore == null ? null : Math.round(report.sentimentScore);
  const sentimentLabel = report.sentimentLabel ?? sentimentFromScore(sentiment);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-xs">
        <ScoreRing score={report.meetingScore} size={72} strokeWidth={6} />
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Gauge className="size-4" aria-hidden="true" /> Meeting score
          </p>
          <p className="text-lg font-semibold">{TONE_TEXT[scoreTone(report.meetingScore)]}</p>
          <p className="text-xs text-muted-foreground">Agenda, decisions, next steps and engagement</p>
        </div>
      </div>
      <div className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-5 shadow-xs">
        <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Zap className="size-4 text-brand-accent" aria-hidden="true" /> Engagement
        </p>
        <p className="text-3xl font-semibold tabular-nums">
          {engagement ?? "—"}
          <span className="text-base font-normal text-muted-foreground">/100</span>
        </p>
        <Bar value={engagement} className="bg-brand-accent" />
      </div>
      <div className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-5 shadow-xs">
        <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Smile className="size-4" aria-hidden="true" /> Sentiment
        </p>
        <div className="flex items-baseline gap-3">
          <p className="text-3xl font-semibold tabular-nums">
            {sentiment ?? "—"}
            <span className="text-base font-normal text-muted-foreground">/100</span>
          </p>
          <SentimentIndicator label={sentimentLabel} className="text-sm" />
        </div>
        <Bar
          value={sentiment}
          className={cn(
            sentimentLabel === "positive" ? "bg-sentiment-positive" : sentimentLabel === "negative" ? "bg-sentiment-negative" : "bg-sentiment-neutral",
          )}
        />
        <span className="sr-only">{sentimentLabel ? SENTIMENT_META[sentimentLabel].label : "No sentiment"}</span>
      </div>
    </div>
  );
}
