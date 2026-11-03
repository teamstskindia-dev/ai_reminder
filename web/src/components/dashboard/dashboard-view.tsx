"use client";

import { AlarmClock, BarChart3, CalendarDays, Clock, FileText, Gauge, ListChecks, Plus, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ActionItemDialog } from "@/components/action-items/action-item-dialog";
import { ActionItemRow } from "@/components/action-items/action-item-row";
import { SectionCard } from "@/components/common/section-card";
import { EmptyState, ErrorState } from "@/components/common/states";
import { GoogleCalendarCard } from "@/components/integrations/google-calendar-card";
import { AddMeetingDialog } from "@/components/meetings/add-meeting-dialog";
import { SentimentIndicator } from "@/components/meetings/indicators";
import { ScoreRing } from "@/components/meetings/score-ring";
import { UpcomingMeetingRow } from "@/components/meetings/upcoming-meeting-row";
import { ReminderDialog } from "@/components/reminders/reminder-dialog";
import { ReminderRow } from "@/components/reminders/reminder-row";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard } from "@/hooks/queries/use-dashboard";
import { useSession } from "@/hooks/queries/use-session";
import type { MeetingListItem } from "@/lib/api/types";
import { formatDayLabel, formatDuration, formatRelativeDateTime, greeting } from "@/lib/format";
import { reportHref } from "@/lib/routes";
import { useBanners, useConfig } from "@/providers/config-provider";
import { DashboardBanners } from "./dashboard-banners";
import { StatCard, StatCardSkeleton } from "./stat-card";

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentReportRow({ meeting }: { meeting: MeetingListItem }) {
  return (
    <Link href={reportHref(meeting.id)} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5">
      <ScoreRing score={meeting.report?.meetingScore} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{meeting.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatRelativeDateTime(meeting.startAt)}
          {meeting.durationSeconds ? ` · ${formatDuration(meeting.durationSeconds)}` : ""}
          {meeting.actionItemCount ? ` · ${meeting.actionItemCount} action items` : ""}
        </p>
      </div>
      {meeting.report && <SentimentIndicator label={meeting.report.sentimentLabel} score={meeting.report.sentimentScore} showText={false} />}
    </Link>
  );
}

function groupByDay(meetings: MeetingListItem[]) {
  const groups: { label: string; items: MeetingListItem[] }[] = [];
  for (const m of meetings) {
    const label = formatDayLabel(m.startAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }
  return groups;
}

export function DashboardView() {
  const { data: session } = useSession();
  const config = useConfig();
  const configBanners = useBanners("dashboard");
  const dashboard = useDashboard();
  const [newItem, setNewItem] = useState(false);
  const [newReminder, setNewReminder] = useState(false);
  const user = session?.user;
  const firstName = user?.name?.split(" ")[0];
  const d = dashboard.data;
  const features = config.features;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s happening with your meetings.</p>
        </div>
        <AddMeetingDialog />
      </div>

      <DashboardBanners banners={d?.banners ?? configBanners} />

      {user && !user.calendarConnected && features.calendarSync && <GoogleCalendarCard />}

      {dashboard.isError ? (
        <div className="rounded-xl border bg-card">
          <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} title="Couldn't load your dashboard" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            {!d ? (
              Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard icon={Video} label="Meetings this week" value={d.stats.meetingsThisWeek} />
                <StatCard icon={Clock} label="Hours in meetings" value={d.stats.hoursThisWeek.toFixed(1)} hint="This week" />
                {features.actionItems && <StatCard icon={ListChecks} label="Open action items" value={d.stats.openActionItems} />}
                {features.reminders && <StatCard icon={AlarmClock} label="Pending reminders" value={d.stats.pendingReminders} />}
                <StatCard
                  icon={Gauge}
                  label="Avg. meeting score"
                  value={d.stats.avgMeetingScore == null ? "—" : Math.round(d.stats.avgMeetingScore)}
                  hint={features.analytics ? <Link href="/analytics/overview" className="hover:underline">See analytics</Link> : undefined}
                  className="col-span-2 lg:col-span-1"
                />
              </>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <SectionCard title="Upcoming meetings" href="/calendar" hrefLabel="Open calendar">
                {!d ? (
                  <ListSkeleton />
                ) : d.upcomingMeetings.length === 0 ? (
                  <EmptyState
                    compact
                    icon={CalendarDays}
                    title="No upcoming meetings"
                    description="Meetings with a Google Meet link from your calendar show up here."
                    action={<AddMeetingDialog trigger={<Button size="sm" variant="outline"><Plus /> Add meeting</Button>} />}
                  />
                ) : (
                  groupByDay(d.upcomingMeetings).map((group) => (
                    <div key={group.label}>
                      <p className="border-b bg-muted/30 px-4 py-1.5 text-xs font-medium text-muted-foreground sm:px-5">{group.label}</p>
                      <div className="divide-y">
                        {group.items.map((m) => (
                          <UpcomingMeetingRow key={m.id} meeting={m} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </SectionCard>

              <SectionCard title="Recent reports" href="/analytics/reports">
                {!d ? (
                  <ListSkeleton />
                ) : d.recentReports.length === 0 ? (
                  <EmptyState compact icon={FileText} title="No reports yet" description="Reports appear a few minutes after a meeting ends." />
                ) : (
                  <div className="divide-y">
                    {d.recentReports.map((m) => (
                      <RecentReportRow key={m.id} meeting={m} />
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            <div className="space-y-6">
              {features.actionItems && (
                <SectionCard
                  title="Open action items"
                  href="/action-items"
                  action={
                    <Button variant="ghost" size="icon-xs" aria-label="New action item" onClick={() => setNewItem(true)}>
                      <Plus />
                    </Button>
                  }
                >
                  {!d ? (
                    <ListSkeleton />
                  ) : d.openActionItems.length === 0 ? (
                    <EmptyState compact icon={ListChecks} title="Nothing open" description="You're on top of every commitment." />
                  ) : (
                    <div className="divide-y px-4 sm:px-5">
                      {d.openActionItems.map((item) => (
                        <ActionItemRow key={item.id} item={item} compact />
                      ))}
                    </div>
                  )}
                </SectionCard>
              )}

              {features.reminders && (
                <SectionCard
                  title="Upcoming reminders"
                  href="/reminders"
                  action={
                    <Button variant="ghost" size="icon-xs" aria-label="New reminder" onClick={() => setNewReminder(true)}>
                      <Plus />
                    </Button>
                  }
                >
                  {!d ? (
                    <ListSkeleton />
                  ) : d.upcomingReminders.length === 0 ? (
                    <EmptyState
                      compact
                      icon={AlarmClock}
                      title="No reminders scheduled"
                      action={
                        <Button size="sm" variant="outline" onClick={() => setNewReminder(true)}>
                          <Plus /> New reminder
                        </Button>
                      }
                    />
                  ) : (
                    <div className="divide-y px-4 sm:px-5">
                      {d.upcomingReminders.map((r) => (
                        <ReminderRow key={r.id} reminder={r} compact />
                      ))}
                    </div>
                  )}
                </SectionCard>
              )}

              {features.analytics && (
                <Link
                  href="/analytics/overview"
                  className="flex items-center gap-4 rounded-xl border bg-linear-to-br from-brand-soft to-card p-5 shadow-xs transition-shadow hover:shadow-md"
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <BarChart3 className="size-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">Meeting analytics</span>
                    <span className="block text-xs text-muted-foreground">Scores, sentiment and where your time goes</span>
                  </span>
                </Link>
              )}
            </div>
          </div>
        </>
      )}

      <ActionItemDialog open={newItem} onOpenChange={setNewItem} />
      <ReminderDialog open={newReminder} onOpenChange={setNewReminder} />
    </div>
  );
}
