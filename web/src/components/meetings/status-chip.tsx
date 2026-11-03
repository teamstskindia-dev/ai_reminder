import { AlertCircle, Ban, CheckCircle2, Clock, Loader2, SkipForward } from "lucide-react";
import type { MeetingStatus } from "@/lib/api/types";
import { STATUS_META, type StatusTone } from "@/lib/meeting";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
  live: "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300",
  processing: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300",
  success: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
  danger: "bg-destructive/10 text-destructive ring-destructive/20",
  muted: "bg-muted text-muted-foreground/80 ring-border",
};

function StatusIcon({ status }: { status: MeetingStatus }) {
  const cls = "size-3 shrink-0";
  switch (status) {
    case "joining":
    case "waiting_room":
    case "in_progress":
      return (
        <span className="relative flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
      );
    case "processing":
      return <Loader2 className={cn(cls, "animate-spin")} aria-hidden="true" />;
    case "completed":
      return <CheckCircle2 className={cls} aria-hidden="true" />;
    case "failed":
      return <AlertCircle className={cls} aria-hidden="true" />;
    case "cancelled":
      return <Ban className={cls} aria-hidden="true" />;
    case "skipped":
      return <SkipForward className={cls} aria-hidden="true" />;
    default:
      return <Clock className={cls} aria-hidden="true" />;
  }
}

export function StatusChip({
  status,
  size = "default",
  className,
}: {
  status: MeetingStatus;
  size?: "sm" | "default";
  className?: string;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.scheduled;
  return (
    <span
      title={meta.description}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        TONE_CLASS[meta.tone],
        className,
      )}
    >
      <StatusIcon status={status} />
      {meta.label}
    </span>
  );
}
