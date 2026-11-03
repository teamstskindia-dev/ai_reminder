"use client";

import { MoreHorizontal, Pencil, Sparkles, Trash2, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PriorityBadge } from "@/components/common/priority-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteActionItem, useUpdateActionItem } from "@/hooks/queries/use-action-items";
import type { ActionItem } from "@/lib/api/types";
import { reportHref } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { ActionItemDialog } from "./action-item-dialog";
import { DueDatePopover, DueLabel } from "./due-date-popover";
import { RemindMeMenu } from "./remind-me-menu";

/** Checkbox to complete/reopen an action item (optimistic). */
export function ActionItemCheck({ item }: { item: ActionItem }) {
  const update = useUpdateActionItem();
  const done = item.status === "done";
  return (
    <Checkbox
      checked={done}
      aria-label={done ? `Reopen “${item.title}”` : `Complete “${item.title}”`}
      className="mt-0.5 size-[18px] rounded-full"
      onCheckedChange={(checked) =>
        update.mutate(
          { id: item.id, input: { status: checked ? "done" : "open" } },
          {
            onSuccess: () => {
              if (checked) toast.success("Nice — marked as done");
            },
          },
        )
      }
    />
  );
}

export function ActionItemRow({
  item,
  showMeeting = true,
  compact = false,
}: {
  item: ActionItem;
  showMeeting?: boolean;
  /** Dashboard-style: read-only due label, no inline editors. */
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useDeleteActionItem();
  const done = item.status === "done";

  return (
    <div className={cn("group flex items-start gap-3", compact ? "py-2.5" : "px-4 py-3.5 sm:px-5")}>
      <ActionItemCheck item={item} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn("text-sm leading-snug font-medium", done && "text-muted-foreground line-through")}>{item.title}</p>
        {!compact && item.description && <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {compact ? <DueLabel item={item} /> : null}
          {item.source === "ai" && (
            <span className="inline-flex items-center gap-1" title="Captured by AI from the meeting">
              <Sparkles className="size-3 text-primary" aria-hidden="true" /> AI
            </span>
          )}
          {!item.isMine && item.assigneeName && <span>Owner: {item.assigneeName}</span>}
          {showMeeting && item.meetingId && item.meetingTitle && (
            <Link href={reportHref(item.meetingId)} className="inline-flex min-w-0 items-center gap-1 hover:text-foreground hover:underline">
              <Video className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.meetingTitle}</span>
            </Link>
          )}
        </div>
      </div>
      {!compact && (
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
          <DueDatePopover item={item} />
          <div className="flex items-center gap-1">
            <PriorityBadge priority={item.priority} />
            {!done && <RemindMeMenu item={item} />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More actions for “${item.title}”`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
      {compact && <PriorityBadge priority={item.priority} className="shrink-0" />}
      <ActionItemDialog open={editing} onOpenChange={setEditing} item={item} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this action item?"
        description="It will be removed everywhere, including any reminders linked to it."
        confirmLabel="Delete"
        destructive
        onConfirm={() =>
          remove.mutate(item.id, {
            onSuccess: () => toast.success("Action item deleted"),
          })
        }
      />
    </div>
  );
}
