"use client";

import { AlertTriangle, Ban, CalendarClock, FileQuestion, Loader2, Radio, RotateCcw, SkipForward } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useReprocessMeeting } from "@/hooks/queries/use-meetings";
import type { MeetingDetail } from "@/lib/api/types";
import { formatDayLabel, formatTime, timeAgo } from "@/lib/format";
import { botSupported, STATUS_META } from "@/lib/meeting";
import { cn } from "@/lib/utils";
import { AutoJoinSwitch } from "../auto-join-switch";
import { BotLeaveButton, SendBotButton } from "../bot-actions";

function Panel({
  icon,
  tone = "default",
  title,
  children,
  actions,
}: {
  icon: ReactNode;
  tone?: "default" | "live" | "danger" | "muted";
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs sm:flex-row sm:items-center sm:p-6",
        tone === "live" && "border-rose-500/30 bg-rose-500/[0.03]",
        tone === "danger" && "border-destructive/30 bg-destructive/[0.03]",
      )}
    >
      <div className="flex flex-1 items-start gap-4">
        <div
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full",
            tone === "live" ? "bg-rose-500/10 text-rose-600" : tone === "danger" ? "bg-destructive/10 text-destructive" : tone === "muted" ? "bg-muted text-muted-foreground" : "bg-brand-soft text-primary",
          )}
        >
          {icon}
        </div>
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          {children && <div className="text-sm text-muted-foreground">{children}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

function ReprocessButton({ id }: { id: string }) {
  const reprocess = useReprocessMeeting();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={reprocess.isPending}
      onClick={() =>
        reprocess.mutate(id, {
          onSuccess: () => toast.success("Reprocessing started", { description: "We'll notify you when the report is ready." }),
        })
      }
    >
      <RotateCcw /> Reprocess
    </Button>
  );
}

/** Explains the meeting's lifecycle state when there is no report to show (yet). */
export function StatusPanel({ meeting, botName }: { meeting: MeetingDetail; botName: string }) {
  switch (meeting.status) {
    case "scheduled":
      return (
        <Panel
          icon={<CalendarClock className="size-5" />}
          title={`Scheduled for ${formatDayLabel(meeting.startAt)} at ${formatTime(meeting.startAt)}`}
          actions={
            <>
              <AutoJoinSwitch meeting={{ ...meeting, report: null }} showLabel />
              <SendBotButton meeting={meeting} />
            </>
          }
        >
          {botSupported(meeting)
            ? meeting.autoJoin
              ? `${botName} will ask to join when the meeting starts. Admit it from the Meet waiting room.`
              : `Auto-join is off — ${botName} won't join unless you send it.`
            : "This link isn't a Google Meet call, so the notetaker can't join. You can upload a recording afterwards."}
        </Panel>
      );
    case "joining":
    case "waiting_room":
    case "in_progress":
      return (
        <Panel
          tone="live"
          icon={<Radio className="size-5 animate-pulse" />}
          title={STATUS_META[meeting.status].label}
          actions={<BotLeaveButton meeting={meeting} />}
        >
          {meeting.status === "waiting_room"
            ? `${botName} is waiting in the lobby. Ask the host to admit it.`
            : meeting.status === "joining"
              ? `${botName} is joining the call…`
              : `${botName} is in the call${meeting.botJoinedAt ? ` (joined ${timeAgo(meeting.botJoinedAt)})` : ""} and capturing the conversation. The report will be ready a few minutes after the call ends.`}
        </Panel>
      );
    case "processing":
      return (
        <div className="space-y-4">
          <Panel icon={<Loader2 className="size-5 animate-spin" />} title="Writing your report">
            The AI is summarising the conversation, extracting action items and scoring the meeting. This usually takes a
            couple of minutes — this page updates automatically.
          </Panel>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      );
    case "failed":
      return (
        <Panel
          tone="danger"
          icon={<AlertTriangle className="size-5" />}
          title="Something went wrong"
          actions={
            <>
              <ReprocessButton id={meeting.id} />
              <SendBotButton meeting={meeting} />
            </>
          }
        >
          {meeting.failureReason || STATUS_META.failed.description}
        </Panel>
      );
    case "cancelled":
      return (
        <Panel tone="muted" icon={<Ban className="size-5" />} title="Meeting cancelled">
          This event was cancelled in your calendar.
        </Panel>
      );
    case "skipped":
      return (
        <Panel tone="muted" icon={<SkipForward className="size-5" />} title="Notetaker skipped this meeting" actions={<SendBotButton meeting={meeting} />}>
          Auto-join was off or the meeting wasn&apos;t eligible.
        </Panel>
      );
    default:
      return (
        <Panel icon={<FileQuestion className="size-5" />} title="No report for this meeting" actions={<ReprocessButton id={meeting.id} />}>
          We didn&apos;t capture enough conversation to write a report. If there is a transcript, try reprocessing.
        </Panel>
      );
  }
}
