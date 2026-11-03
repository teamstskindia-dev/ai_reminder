"use client";

import { ListChecks, Plus } from "lucide-react";
import { useState } from "react";
import { ActionItemDialog } from "@/components/action-items/action-item-dialog";
import { ActionItemRow } from "@/components/action-items/action-item-row";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import type { ActionItem } from "@/lib/api/types";

export function ActionItemsTab({ meetingId, items }: { meetingId: string; items: ActionItem[] }) {
  const [creating, setCreating] = useState(false);
  const open = items.filter((i) => i.status === "open");
  const done = items.filter((i) => i.status === "done");
  const ordered = [...open, ...done];

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <p className="text-sm text-muted-foreground">
          {open.length} open · {done.length} done
        </p>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus /> Add action item
        </Button>
      </div>
      {ordered.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No action items"
          description="Nothing was assigned in this meeting. Add one if you made a commitment."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> Add action item
            </Button>
          }
        />
      ) : (
        <div className="divide-y">
          {ordered.map((item) => (
            <ActionItemRow key={item.id} item={item} showMeeting={false} />
          ))}
        </div>
      )}
      <ActionItemDialog open={creating} onOpenChange={setCreating} meetingId={meetingId} />
    </div>
  );
}
