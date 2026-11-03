"use client";

import { CheckCircle2, ListChecks, Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { Pager } from "@/components/common/pager";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActionItems } from "@/hooks/queries/use-action-items";
import type { ActionItemStatus } from "@/lib/api/types";
import { ActionItemDialog } from "./action-item-dialog";
import { ActionItemRow } from "./action-item-row";

type Filter = Extract<ActionItemStatus, "open" | "done"> | "all";

export function ActionItemsView() {
  const [status, setStatus] = useState<Filter>("open");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const list = useActionItems({ status, mine, page, limit: 25 });
  const items = list.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Action items"
        description="Commitments captured from your meetings, plus anything you add yourself."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New action item
          </Button>
        }
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <Tabs
            value={status}
            onValueChange={(v) => {
              setStatus(v as Filter);
              setPage(1);
            }}
          >
            <TabsList>
              <TabsTrigger value="open" className="px-3">
                Open
              </TabsTrigger>
              <TabsTrigger value="done" className="px-3">
                Done
              </TabsTrigger>
              <TabsTrigger value="all" className="px-3">
                All
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="inline-flex items-center gap-2 text-sm">
            <Switch
              checked={mine}
              onCheckedChange={(v) => {
                setMine(v);
                setPage(1);
              }}
            />
            Mine only
          </label>
        </div>
        {list.isPending ? (
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-4">
                <Skeleton className="size-[18px] rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} title="Couldn't load action items" />
        ) : items.length === 0 ? (
          status === "open" ? (
            <EmptyState
              icon={CheckCircle2}
              title={mine ? "Nothing open for you" : "All clear"}
              description="No open action items. New ones are captured automatically from your meetings."
              action={
                <Button variant="outline" onClick={() => setCreating(true)}>
                  <Plus /> Add one
                </Button>
              }
            />
          ) : (
            <EmptyState icon={ListChecks} title={status === "done" ? "Nothing completed yet" : "No action items yet"} description="Tick items off as you finish them." />
          )
        ) : (
          <div className={list.isPlaceholderData ? "divide-y opacity-60" : "divide-y"}>
            {items.map((item) => (
              <ActionItemRow key={item.id} item={item} />
            ))}
          </div>
        )}
        <Pager meta={list.data?.meta} onPageChange={setPage} disabled={list.isFetching} />
      </div>
      <ActionItemDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
