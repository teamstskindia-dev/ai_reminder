"use client";

import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUpdateMeeting } from "@/hooks/queries/use-meetings";
import type { MeetingListItem } from "@/lib/api/types";
import { botSupported } from "@/lib/meeting";

/** Per-meeting "notetaker joins" toggle (optimistic). Disabled for non-Meet links. */
export function AutoJoinSwitch({ meeting, showLabel = false }: { meeting: MeetingListItem; showLabel?: boolean }) {
  const update = useUpdateMeeting();
  const supported = botSupported(meeting);
  const id = `autojoin-${meeting.id}`;

  const control = (
    <span className="inline-flex items-center gap-2">
      <Switch
        id={id}
        checked={supported && meeting.autoJoin}
        disabled={!supported || update.isPending}
        aria-label={`Notetaker joins “${meeting.title}”`}
        onCheckedChange={(checked) =>
          update.mutate(
            { id: meeting.id, input: { autoJoin: checked } },
            {
              onSuccess: () => toast.success(checked ? "The notetaker will join this meeting" : "The notetaker will skip this meeting"),
            },
          )
        }
      />
      {showLabel && (
        <label htmlFor={id} className="text-xs text-muted-foreground">
          Auto-join
        </label>
      )}
    </span>
  );

  if (supported) return control;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{control}</span>
      </TooltipTrigger>
      <TooltipContent>Bot not supported — only Google Meet links can be joined</TooltipContent>
    </Tooltip>
  );
}
