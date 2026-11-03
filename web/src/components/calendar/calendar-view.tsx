"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { Pager } from "@/components/common/pager";
import { EmptyState, ErrorState } from "@/components/common/states";
import { GoogleCalendarCard } from "@/components/integrations/google-calendar-card";
import { AddMeetingDialog } from "@/components/meetings/add-meeting-dialog";
import { UpcomingMeetingRow } from "@/components/meetings/upcoming-meeting-row";
import { Skeleton } from "@/components/ui/skeleton";
import { useMeetings } from "@/hooks/queries/use-meetings";
import type { MeetingListItem } from "@/lib/api/types";
import { dayKey, formatDayLabel, pluralize } from "@/lib/format";
import { useBranding } from "@/providers/config-provider";

function groupByDay(meetings: MeetingListItem[]) {
  const map = new Map<string, MeetingListItem[]>();
  for (const m of meetings) {
    const key = dayKey(m.startAt);
    map.set(key, [...(map.get(key) ?? []), m]);
  }
  return [...map.entries()].map(([key, items]) => ({ key, label: formatDayLabel(items[0].startAt), items }));
}

export function CalendarView() {
  const { appName } = useBranding();
  const [page, setPage] = useState(1);
  const meetings = useMeetings({ scope: "upcoming", sort: "startAt:asc", page, limit: 30 });
  const items = meetings.data?.items ?? [];
  const groups = groupByDay(items);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description={`Upcoming meetings ${appName} can join. Toggle any meeting off to skip it.`}
        actions={<AddMeetingDialog />}
      />
      <GoogleCalendarCard />

      {meetings.isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, g) => (
            <div key={g} className="overflow-hidden rounded-xl border bg-card">
              <Skeleton className="m-4 h-4 w-32" />
              {Array.from({ length: 3 }).map((__, i) => (
                <div key={i} className="flex items-center gap-4 border-t px-5 py-4">
                  <Skeleton className="h-11 w-16 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : meetings.isError ? (
        <div className="rounded-xl border bg-card">
          <ErrorState error={meetings.error} onRetry={() => meetings.refetch()} title="Couldn't load upcoming meetings" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={CalendarDays}
            title="Nothing on the calendar"
            description="Meetings from Google Calendar that include a Google Meet link appear here automatically. You can also add one by hand."
            action={<AddMeetingDialog />}
          />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.key} className="overflow-hidden rounded-xl border bg-card shadow-xs" aria-label={group.label}>
              <header className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5 sm:px-5">
                <h2 className="text-sm font-semibold">{group.label}</h2>
                <span className="text-xs text-muted-foreground">{pluralize(group.items.length, "meeting")}</span>
              </header>
              <div className="divide-y">
                {group.items.map((m) => (
                  <UpcomingMeetingRow key={m.id} meeting={m} />
                ))}
              </div>
            </section>
          ))}
          <div className="overflow-hidden rounded-xl border bg-card empty:hidden">
            <Pager meta={meetings.data?.meta} onPageChange={setPage} disabled={meetings.isFetching} />
          </div>
        </div>
      )}
    </div>
  );
}
