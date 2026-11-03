"use client";

import { ArrowLeft, CalendarDays, Clock, ExternalLink, MoreHorizontal, RotateCcw, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteMeeting, useReprocessMeeting } from "@/hooks/queries/use-meetings";
import type { MeetingDetail } from "@/lib/api/types";
import { formatDate, formatDuration, formatTime, pluralize } from "@/lib/format";
import { safeUrl } from "@/lib/safe-url";
import { AttendeeStack } from "../attendee-stack";
import { BotLeaveButton, SendBotButton } from "../bot-actions";
import { PlatformBadge } from "../platform-badge";
import { StatusChip } from "../status-chip";

export function ReportHeader({ meeting }: { meeting: MeetingDetail }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const reprocess = useReprocessMeeting();
  const remove = useDeleteMeeting();
  const duration =
    meeting.durationSeconds ??
    (meeting.endAt ? (new Date(meeting.endAt).getTime() - new Date(meeting.startAt).getTime()) / 1000 : null);
  const canReprocess = meeting.status === "completed" || meeting.status === "failed";

  return (
    <div className="space-y-4">
      <Link href="/analytics/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Reports
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={meeting.status} />
            <PlatformBadge platform={meeting.platform} source={meeting.source} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{meeting.title}</h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden="true" />
              {formatDate(meeting.startAt, true)} · {formatTime(meeting.startAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden="true" />
              {formatDuration(duration)}
            </span>
            <span className="inline-flex items-center gap-2">
              <Users className="size-4" aria-hidden="true" />
              {pluralize(meeting.attendeeCount || meeting.attendees.length, "attendee")}
              <AttendeeStack attendees={meeting.attendees} count={meeting.attendeeCount} />
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <SendBotButton meeting={meeting} />
          <BotLeaveButton meeting={meeting} />
          {safeUrl(meeting.meetingUrl) && (
            <Button variant="outline" size="sm" asChild>
              <a href={safeUrl(meeting.meetingUrl) ?? undefined} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Open meeting
              </a>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                disabled={!canReprocess || reprocess.isPending}
                onSelect={() =>
                  reprocess.mutate(meeting.id, {
                    onSuccess: () => toast.success("Reprocessing started", { description: "We'll let you know when it's ready." }),
                  })
                }
              >
                <RotateCcw /> Reprocess report
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 /> Delete meeting
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this meeting?"
        description="The report, transcript and action items will be permanently deleted."
        confirmLabel="Delete meeting"
        destructive
        onConfirm={() =>
          remove.mutate(meeting.id, {
            onSuccess: () => {
              toast.success("Meeting deleted");
              router.push("/analytics/reports");
            },
          })
        }
      />
    </div>
  );
}
