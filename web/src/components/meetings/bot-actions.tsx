"use client";

import { Bot, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useBotJoin, useBotLeave } from "@/hooks/queries/use-meetings";
import type { MeetingListItem } from "@/lib/api/types";
import { canBotLeave, canSendBot } from "@/lib/meeting";

export function SendBotButton({
  meeting,
  size = "sm",
  variant = "outline",
}: {
  meeting: Pick<MeetingListItem, "id" | "platform" | "meetingUrl" | "status">;
  size?: "sm" | "default" | "xs";
  variant?: "outline" | "default" | "secondary" | "ghost";
}) {
  const join = useBotJoin();
  if (!canSendBot(meeting)) return null;
  return (
    <Button
      size={size}
      variant={variant}
      disabled={join.isPending}
      onClick={() =>
        join.mutate(meeting.id, {
          onSuccess: () => toast.success("The notetaker is on its way"),
        })
      }
    >
      <Bot /> {join.isPending ? "Sending…" : "Send bot now"}
    </Button>
  );
}

export function BotLeaveButton({ meeting, size = "sm" }: { meeting: Pick<MeetingListItem, "id" | "status">; size?: "sm" | "default" | "xs" }) {
  const leave = useBotLeave();
  if (!canBotLeave(meeting)) return null;
  return (
    <Button
      size={size}
      variant="outline"
      disabled={leave.isPending}
      onClick={() =>
        leave.mutate(meeting.id, {
          onSuccess: () => toast.success("The notetaker is leaving the call"),
        })
      }
    >
      <LogOut /> {leave.isPending ? "Leaving…" : "Make bot leave"}
    </Button>
  );
}
