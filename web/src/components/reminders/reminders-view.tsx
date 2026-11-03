"use client";

import { AlarmClock, History, Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { Pager } from "@/components/common/pager";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useReminders } from "@/hooks/queries/use-reminders";
import type { Reminder } from "@/lib/api/types";
import { dayKey, formatDayLabel } from "@/lib/format";
import { ReminderDialog } from "./reminder-dialog";
import { ReminderRow } from "./reminder-row";

function groupByDay(reminders: Reminder[]) {
  const map = new Map<string, Reminder[]>();
  for (const r of reminders) {
    const key = dayKey(r.remindAt);
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()].map(([key, items]) => ({ key, label: formatDayLabel(items[0].remindAt), items }));
}

function ListSkeleton() {
  return (
    <div className="divide-y rounded-xl border bg-card">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Upcoming({ onCreate }: { onCreate: () => void }) {
  const [page, setPage] = useState(1);
  const list = useReminders({ status: "pending", page, limit: 50 });
  const items = list.data?.items ?? [];
  if (list.isPending) return <ListSkeleton />;
  if (list.isError)
    return (
      <div className="rounded-xl border bg-card">
        <ErrorState error={list.error} onRetry={() => list.refetch()} title="Couldn't load reminders" />
      </div>
    );
  if (items.length === 0)
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={AlarmClock}
          title="No upcoming reminders"
          description="Reminders are created automatically for commitments in your meetings — or set one yourself."
          action={
            <Button variant="outline" onClick={onCreate}>
              <Plus /> New reminder
            </Button>
          }
        />
      </div>
    );
  return (
    <div className="space-y-5">
      {groupByDay(items).map((group) => (
        <section key={group.key} aria-label={group.label} className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <h2 className="border-b bg-muted/30 px-4 py-2.5 text-sm font-semibold sm:px-5">{group.label}</h2>
          <div className="divide-y">
            {group.items.map((r) => (
              <ReminderRow key={r.id} reminder={r} />
            ))}
          </div>
        </section>
      ))}
      <div className="overflow-hidden rounded-xl border bg-card empty:hidden">
        <Pager meta={list.data?.meta} onPageChange={setPage} disabled={list.isFetching} />
      </div>
    </div>
  );
}

const HISTORY_FILTERS = [
  { value: "sent", label: "Sent" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Failed" },
] as const;

function HistoryList() {
  const [status, setStatus] = useState<(typeof HISTORY_FILTERS)[number]["value"]>("sent");
  const [page, setPage] = useState(1);
  const list = useReminders({ status, page, limit: 30 });
  const items = list.data?.items ?? [];
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="border-b p-3 sm:px-5">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={status}
          onValueChange={(v) => {
            if (!v) return;
            setStatus(v as typeof status);
            setPage(1);
          }}
          aria-label="Reminder history filter"
        >
          {HISTORY_FILTERS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value} className="px-3 text-xs">
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {list.isPending ? (
        <div className="space-y-4 p-5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} title="Couldn't load history" />
      ) : items.length === 0 ? (
        <EmptyState icon={History} title={`No ${status} reminders`} description="Reminders move here after they fire or are cancelled." />
      ) : (
        <div className="divide-y">
          {items.map((r) => (
            <ReminderRow key={r.id} reminder={r} />
          ))}
        </div>
      )}
      <Pager meta={list.data?.meta} onPageChange={setPage} disabled={list.isFetching} />
    </div>
  );
}

export function RemindersView() {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reminders"
        description="Nudges before meetings and before your commitments are due."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New reminder
          </Button>
        }
      />
      <Tabs defaultValue="upcoming" className="gap-4">
        <TabsList>
          <TabsTrigger value="upcoming" className="px-3">
            Upcoming
          </TabsTrigger>
          <TabsTrigger value="history" className="px-3">
            History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">
          <Upcoming onCreate={() => setCreating(true)} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryList />
        </TabsContent>
      </Tabs>
      <ReminderDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
