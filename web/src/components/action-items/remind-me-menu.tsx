"use client";

import { BellPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ReminderDialog } from "@/components/reminders/reminder-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateReminder } from "@/hooks/queries/use-reminders";
import type { ActionItem } from "@/lib/api/types";
import { formatRelativeDateTime, isFutureDate } from "@/lib/format";
import { useFeature } from "@/providers/config-provider";

function inHours(hours: number) {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

function tomorrowAt9() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/** "Remind me" for an action item: quick presets or a custom time (creates a reminder). */
export function RemindMeMenu({ item, size = "icon-sm" }: { item: ActionItem; size?: "icon-sm" | "sm" }) {
  const enabled = useFeature("reminders");
  const create = useCreateReminder();
  const [customOpen, setCustomOpen] = useState(false);
  if (!enabled) return null;

  const dueInFuture = item.dueAt && isFutureDate(item.dueAt, 60_000) ? item.dueAt : null;

  const remind = (remindAt: string) =>
    create.mutate(
      {
        title: item.title,
        body: item.meetingTitle ? `From “${item.meetingTitle}”` : undefined,
        remindAt,
        actionItemId: item.id,
        meetingId: item.meetingId ?? undefined,
      },
      {
        onSuccess: () => toast.success(`Reminder set for ${formatRelativeDateTime(remindAt)}`),
      },
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {size === "sm" ? (
            <Button variant="outline" size="sm" disabled={create.isPending}>
              <BellPlus /> Remind me
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label={`Remind me about “${item.title}”`} disabled={create.isPending}>
              <BellPlus />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Remind me</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => remind(inHours(1))}>In 1 hour</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => remind(inHours(3))}>In 3 hours</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => remind(tomorrowAt9())}>Tomorrow at 9:00 AM</DropdownMenuItem>
          {dueInFuture && <DropdownMenuItem onSelect={() => remind(dueInFuture)}>When it&apos;s due</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCustomOpen(true)}>Custom…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReminderDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        prefill={{
          title: item.title,
          body: item.meetingTitle ? `From “${item.meetingTitle}”` : undefined,
          remindAt: dueInFuture ?? undefined,
          actionItemId: item.id,
          meetingId: item.meetingId ?? undefined,
        }}
      />
    </>
  );
}
