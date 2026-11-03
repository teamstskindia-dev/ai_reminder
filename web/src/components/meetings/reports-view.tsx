"use client";

import { FileText, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { Pager } from "@/components/common/pager";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMeetings } from "@/hooks/queries/use-meetings";
import { useDebouncedValue } from "@/hooks/use-debounce";
import type { MeetingScope, MeetingStatus } from "@/lib/api/types";
import { MEETING_STATUSES, STATUS_META } from "@/lib/meeting";
import { AddMeetingDialog } from "./add-meeting-dialog";
import { MeetingReportRow, MeetingReportRowSkeleton, ReportListHeader } from "./meeting-report-row";
import { WelcomeCalendarDialog } from "./welcome-dialog";

const SCOPES: { value: MeetingScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];
const PAGE_SIZE = 15;

function parseScope(value: string | null): MeetingScope {
  return value === "upcoming" || value === "past" ? value : "all";
}
function parseStatus(value: string | null): MeetingStatus | "any" {
  return value && (MEETING_STATUSES as string[]).includes(value) ? (value as MeetingStatus) : "any";
}

export function ReportsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const scope = parseScope(params.get("tab"));
  const status = parseStatus(params.get("status"));
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const q = useDebouncedValue(query.trim(), 350);
  const [welcomeOpen, setWelcomeOpen] = useState(() => params.get("action") === "welcomeCalendarSuccess");

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Strip the one-time welcome action from the URL once the dialog is showing.
  useEffect(() => {
    if (params.get("action") === "welcomeCalendarSuccess") {
      const next = new URLSearchParams(params.toString());
      next.delete("action");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [params, pathname, router]);

  // Keep ?q= in sync with the debounced search box.
  useEffect(() => {
    if ((params.get("q") ?? "") !== q) {
      const next = new URLSearchParams(params.toString());
      if (q) next.set("q", q);
      else next.delete("q");
      next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [q, params, pathname, router]);

  const meetings = useMeetings({
    scope,
    status: status === "any" ? undefined : status,
    q: q || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const items = meetings.data?.items ?? [];
  const filtered = Boolean(q) || status !== "any";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Every meeting the notetaker joined or you uploaded, with AI summaries and scores."
        actions={<AddMeetingDialog />}
      />

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="flex flex-col gap-3 border-b p-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={scope} onValueChange={(v) => setParams({ tab: v === "all" ? null : v, page: null })}>
            <TabsList>
              {SCOPES.map((s) => (
                <TabsTrigger key={s.value} value={s.value} className="px-3">
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reports"
                aria-label="Search reports"
                className="pl-8"
              />
            </div>
            <Select value={status} onValueChange={(v) => setParams({ status: v === "any" ? null : v, page: null })}>
              <SelectTrigger className="sm:w-44" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All statuses</SelectItem>
                {MEETING_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ReportListHeader />
        {meetings.isPending ? (
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <MeetingReportRowSkeleton key={i} />
            ))}
          </div>
        ) : meetings.isError ? (
          <ErrorState error={meetings.error} onRetry={() => meetings.refetch()} title="Couldn't load your reports" />
        ) : items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={Search}
              title="No reports match your filters"
              description="Try a different search or status."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setParams({ q: null, status: null, page: null });
                  }}
                >
                  <X /> Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={FileText}
              title={scope === "upcoming" ? "No upcoming meetings" : "No reports yet"}
              description={
                scope === "upcoming"
                  ? "Meetings from your Google Calendar with a Meet link show up here."
                  : "Once the notetaker joins a meeting (or you upload a recording), the report appears here."
              }
              action={<AddMeetingDialog />}
            />
          )
        ) : (
          <div className={meetings.isPlaceholderData ? "divide-y opacity-60 transition-opacity" : "divide-y"}>
            {items.map((m) => (
              <MeetingReportRow key={m.id} meeting={m} />
            ))}
          </div>
        )}
        <Pager
          meta={meetings.data?.meta}
          disabled={meetings.isFetching}
          onPageChange={(p) => setParams({ page: p === 1 ? null : String(p) })}
        />
      </div>

      <WelcomeCalendarDialog open={welcomeOpen} onOpenChange={setWelcomeOpen} />
    </div>
  );
}
