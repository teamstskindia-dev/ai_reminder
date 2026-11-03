import { ListChecks } from "lucide-react";
import Link from "next/link";
import type { MeetingListItem } from "@/lib/api/types";
import { formatDate, formatDuration, formatTime } from "@/lib/format";
import { reportHref } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { AttendeeStack } from "./attendee-stack";
import { MiniMeter, SentimentIndicator } from "./indicators";
import { PlatformBadge } from "./platform-badge";
import { ScoreRing } from "./score-ring";
import { StatusChip } from "./status-chip";
import { TopicChips } from "./topic-chips";

export const REPORT_GRID =
  "lg:grid lg:grid-cols-[3rem_minmax(0,2.6fr)_minmax(0,1.15fr)_4.5rem_4.5rem_minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-4";

export function ReportListHeader() {
  return (
    <div className={cn("hidden border-b bg-muted/30 px-5 py-2.5 text-xs font-medium text-muted-foreground", REPORT_GRID)}>
      <span className="text-center">Score</span>
      <span>Meeting</span>
      <span>Date</span>
      <span>Duration</span>
      <span>People</span>
      <span>Status</span>
      <span>Engagement · Sentiment</span>
    </div>
  );
}

/** One row of the reports list (Read-style): score ring, title + topics, date, duration, people, status, signals. */
export function MeetingReportRow({ meeting }: { meeting: MeetingListItem }) {
  const report = meeting.report;
  const durationSeconds =
    meeting.durationSeconds ??
    (meeting.endAt ? Math.max(0, (new Date(meeting.endAt).getTime() - new Date(meeting.startAt).getTime()) / 1000) : null);

  return (
    <Link
      href={reportHref(meeting.id)}
      className={cn(
        "group flex gap-4 px-4 py-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none sm:px-5",
        REPORT_GRID,
      )}
    >
      <ScoreRing score={report?.meetingScore} size={44} className="shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium group-hover:text-primary">{meeting.title}</p>
        </div>
        {report?.summaryPreview ? (
          <p className="line-clamp-1 text-sm text-muted-foreground">{report.summaryPreview}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <PlatformBadge platform={meeting.platform} source={meeting.source} />
          {meeting.actionItemCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <ListChecks className="size-3" aria-hidden="true" /> {meeting.actionItemCount}
            </span>
          )}
          <TopicChips topics={report?.topics ?? []} />
        </div>
        {/* Compact meta for small screens */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-muted-foreground lg:hidden">
          <span>
            {formatDate(meeting.startAt)} · {formatTime(meeting.startAt)}
          </span>
          {durationSeconds ? <span>{formatDuration(durationSeconds)}</span> : null}
          <AttendeeStack count={meeting.attendeeCount} />
          <StatusChip status={meeting.status} size="sm" />
          {report && <SentimentIndicator label={report.sentimentLabel} score={report.sentimentScore} />}
        </div>
      </div>
      <div className="hidden text-sm lg:block">
        <p className="font-medium">{formatDate(meeting.startAt)}</p>
        <p className="text-xs text-muted-foreground">{formatTime(meeting.startAt)}</p>
      </div>
      <p className="hidden text-sm text-muted-foreground tabular-nums lg:block">{formatDuration(durationSeconds)}</p>
      <div className="hidden lg:block">
        <AttendeeStack count={meeting.attendeeCount} />
      </div>
      <div className="hidden lg:block">
        <StatusChip status={meeting.status} />
      </div>
      <div className="hidden flex-col items-start gap-1.5 lg:flex">
        {report ? (
          <>
            <MiniMeter value={report.engagementScore} />
            <SentimentIndicator label={report.sentimentLabel} score={report.sentimentScore} />
          </>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    </Link>
  );
}

export function MeetingReportRowSkeleton() {
  return (
    <div className={cn("flex gap-4 px-4 py-4 sm:px-5", REPORT_GRID)}>
      <div className="size-11 shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
      <div className="hidden h-8 animate-pulse rounded bg-muted lg:block" />
      <div className="hidden h-4 animate-pulse rounded bg-muted lg:block" />
      <div className="hidden h-4 animate-pulse rounded bg-muted lg:block" />
      <div className="hidden h-6 w-24 animate-pulse rounded-full bg-muted lg:block" />
      <div className="hidden h-8 animate-pulse rounded bg-muted lg:block" />
    </div>
  );
}
