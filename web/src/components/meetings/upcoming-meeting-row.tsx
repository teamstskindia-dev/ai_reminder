"use client";

import { AlertCircle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { MeetingListItem } from "@/lib/api/types";
import { formatDuration, formatTime } from "@/lib/format";
import { botSupported, isLive } from "@/lib/meeting";
import { reportHref } from "@/lib/routes";
import { safeUrl } from "@/lib/safe-url";
import { cn } from "@/lib/utils";
import { AttendeeStack } from "./attendee-stack";
import { AutoJoinSwitch } from "./auto-join-switch";
import { BotLeaveButton, SendBotButton } from "./bot-actions";
import { PlatformBadge } from "./platform-badge";
import { StatusChip } from "./status-chip";

function botStatusText(m: MeetingListItem): string {
  if (!botSupported(m)) return "Bot not supported";
  if (isLive(m.status)) return "";
  return m.autoJoin ? "Notetaker will join" : "Notetaker off";
}

/** Upcoming meeting with time, bot status, auto-join toggle and "send bot now". */
export function UpcomingMeetingRow({ meeting, showActions = true }: { meeting: MeetingListItem; showActions?: boolean }) {
  const supported = botSupported(meeting);
  const live = isLive(meeting.status);
  const meetingUrl = safeUrl(meeting.meetingUrl);
  const minutes = meeting.endAt ? (new Date(meeting.endAt).getTime() - new Date(meeting.startAt).getTime()) / 1000 : null;

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className={cn("w-16 shrink-0 rounded-lg border px-2 py-1.5 text-center", live ? "border-rose-500/40 bg-rose-500/5" : "bg-muted/40")}>
          <p className="text-sm font-semibold tabular-nums">{formatTime(meeting.startAt).replace(/ (AM|PM)$/, "")}</p>
          <p className="text-[10px] font-medium text-muted-foreground uppercase">{formatTime(meeting.startAt).slice(-2)}</p>
        </div>
        <div className="min-w-0 space-y-1">
          <Link href={reportHref(meeting.id)} className="block truncate font-medium hover:text-primary hover:underline">
            {meeting.title}
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <PlatformBadge platform={meeting.platform} source={meeting.source} />
            {minutes ? <span>{formatDuration(minutes)}</span> : null}
            <AttendeeStack count={meeting.attendeeCount} />
            {live ? (
              <StatusChip status={meeting.status} size="sm" />
            ) : (
              <span className={cn("inline-flex items-center gap-1", !supported && "text-amber-700 dark:text-amber-400")}>
                {!supported && <AlertCircle className="size-3" aria-hidden="true" />}
                {botStatusText(meeting)}
              </span>
            )}
          </div>
        </div>
      </div>
      {showActions && (
        <div className="flex items-center gap-2 pl-20 sm:pl-0">
          {meetingUrl && (
            <Button asChild variant="ghost" size="icon-sm" aria-label={`Open “${meeting.title}” meeting link`}>
              <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
              </a>
            </Button>
          )}
          <SendBotButton meeting={meeting} size="xs" />
          <BotLeaveButton meeting={meeting} size="xs" />
          {!live && <AutoJoinSwitch meeting={meeting} />}
        </div>
      )}
    </div>
  );
}
