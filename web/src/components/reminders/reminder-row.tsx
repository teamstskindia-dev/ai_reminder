"use client";

import { AlarmClock, BellRing, Mail, MoreHorizontal, Pencil, Smartphone, Trash2, Video, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteReminder, useSnoozeReminder, useUpdateReminder } from "@/hooks/queries/use-reminders";
import type { Reminder, ReminderChannel } from "@/lib/api/types";
import { formatRelativeDateTime, formatTime } from "@/lib/format";
import { reportHref } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { ReminderDialog } from "./reminder-dialog";

const CHANNEL_ICON: Record<ReminderChannel, { icon: typeof Mail; label: string }> = {
  push: { icon: Smartphone, label: "Push" },
  in_app: { icon: BellRing, label: "In-app" },
  email: { icon: Mail, label: "Email" },
};

const STATUS_STYLE: Record<Reminder["status"], string> = {
  pending: "bg-brand-soft text-brand-soft-foreground",
  sent: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
};

function minutesUntilTomorrow9() {
  const target = new Date();
  target.setDate(target.getDate() + 1);
  target.setHours(9, 0, 0, 0);
  return { iso: target.toISOString(), minutes: Math.round((target.getTime() - Date.now()) / 60000) };
}

export function ReminderRow({ reminder, compact = false }: { reminder: Reminder; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const snooze = useSnoozeReminder();
  const update = useUpdateReminder();
  const remove = useDeleteReminder();
  const pending = reminder.status === "pending";

  const doSnooze = (minutes: number, label: string) =>
    snooze.mutate({ id: reminder.id, minutes }, { onSuccess: () => toast.success(`Snoozed ${label}`) });

  const snoozeTomorrow = () => {
    const { iso, minutes } = minutesUntilTomorrow9();
    // The snooze endpoint accepts up to 24h; beyond that reschedule directly.
    if (minutes >= 5 && minutes <= 1440) doSnooze(minutes, "until tomorrow 9:00 AM");
    else
      update.mutate(
        { id: reminder.id, input: { remindAt: iso } },
        { onSuccess: () => toast.success("Snoozed until tomorrow 9:00 AM") },
      );
  };

  return (
    <div className={cn("flex items-start gap-3", compact ? "py-2.5" : "px-4 py-3.5 sm:px-5")}>
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", pending ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground")}>
        <AlarmClock className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn("text-sm leading-snug font-medium", reminder.status === "cancelled" && "text-muted-foreground line-through")}>
          {reminder.title}
        </p>
        {!compact && reminder.body && <p className="line-clamp-2 text-sm text-muted-foreground">{reminder.body}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className={cn(pending && "font-medium text-foreground/80")}>
            {compact ? formatRelativeDateTime(reminder.remindAt) : formatTime(reminder.remindAt)}
          </span>
          {!compact && (
            <span className="inline-flex items-center gap-1.5">
              {reminder.channels.map((c) => {
                const meta = CHANNEL_ICON[c];
                if (!meta) return null;
                const Icon = meta.icon;
                return <Icon key={c} className="size-3.5" aria-label={meta.label} />;
              })}
            </span>
          )}
          {reminder.meetingId && reminder.meetingTitle && (
            <Link href={reportHref(reminder.meetingId)} className="inline-flex min-w-0 items-center gap-1 hover:text-foreground hover:underline">
              <Video className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{reminder.meetingTitle}</span>
            </Link>
          )}
          {!pending && (
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", STATUS_STYLE[reminder.status])}>
              {reminder.status}
            </span>
          )}
        </div>
      </div>
      {!compact && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for reminder “${reminder.title}”`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {(pending || reminder.status === "sent") && (
              <>
                <DropdownMenuLabel>Snooze</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => doSnooze(15, "for 15 minutes")}>15 minutes</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => doSnooze(60, "for 1 hour")}>1 hour</DropdownMenuItem>
                <DropdownMenuItem onSelect={snoozeTomorrow}>Tomorrow at 9:00 AM</DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {pending && (
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil /> Edit
              </DropdownMenuItem>
            )}
            {pending && (
              <DropdownMenuItem
                onSelect={() =>
                  update.mutate(
                    { id: reminder.id, input: { status: "cancelled" } },
                    { onSuccess: () => toast.success("Reminder cancelled") },
                  )
                }
              >
                <XCircle /> Cancel reminder
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ReminderDialog open={editing} onOpenChange={setEditing} reminder={reminder} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this reminder?"
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => remove.mutate(reminder.id, { onSuccess: () => toast.success("Reminder deleted") })}
      />
    </div>
  );
}
