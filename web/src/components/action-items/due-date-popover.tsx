"use client";

import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUpdateActionItem } from "@/hooks/queries/use-action-items";
import type { ActionItem } from "@/lib/api/types";
import { daysUntil, formatRelativeDateTime, fromLocalInputValue, isPastDate, toLocalInputValue } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DueLabel({ item, className }: { item: ActionItem; className?: string }) {
  if (!item.dueAt) return <span className={cn("text-muted-foreground", className)}>No due date</span>;
  const days = daysUntil(item.dueAt);
  const overdue = item.status === "open" && isPastDate(item.dueAt);
  return (
    <span className={cn(overdue ? "font-medium text-destructive" : days === 0 ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground", className)}>
      {overdue ? "Overdue · " : "Due "}
      {formatRelativeDateTime(item.dueAt)}
    </span>
  );
}

/** Inline due-date editor for an action item (optimistic). */
export function DueDatePopover({ item }: { item: ActionItem }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const update = useUpdateActionItem();

  const save = (dueAt: string | null) =>
    update.mutate(
      { id: item.id, input: { dueAt } },
      {
        onSuccess: () => toast.success(dueAt ? "Due date updated" : "Due date cleared"),
      },
    );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(toLocalInputValue(item.dueAt));
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={item.dueAt ? `Change due date (${formatRelativeDateTime(item.dueAt)})` : "Set due date"}
        >
          <CalendarClock className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <DueLabel item={item} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save(fromLocalInputValue(value));
            setOpen(false);
          }}
        >
          <label htmlFor={`due-${item.id}`} className="text-sm font-medium">
            Due date
          </label>
          <Input id={`due-${item.id}`} type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
          <div className="flex justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!item.dueAt}
              onClick={() => {
                save(null);
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button type="submit" size="sm" disabled={!value}>
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
