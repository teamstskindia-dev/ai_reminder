"use client";

import { format, parseISO } from "date-fns";
import { BarChart3, CheckCircle2, Clock, Gauge, Hourglass, Smile, Video, Zap } from "lucide-react";
import { useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState } from "@/components/common/states";
import { AddMeetingDialog } from "@/components/meetings/add-meeting-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAnalytics } from "@/hooks/queries/use-dashboard";
import type { AnalyticsOverview, AnalyticsRange } from "@/lib/api/types";
import { formatDuration, formatMinutes } from "@/lib/format";
import { ChartCard, ChartEmpty } from "./chart-card";
import { ChartTooltip } from "./chart-tooltip";
import { RankedBars } from "./ranked-bars";

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" } as const;
const GRID = "var(--border)";

const dayLabel = (iso: string) => {
  try {
    return format(parseISO(iso), "MMM d");
  } catch {
    return iso;
  }
};
const hourLabel = (h: number) => format(new Date(2000, 0, 1, h), "ha").toLowerCase();
const round = (v: number | null | undefined) => (v == null ? "—" : Math.round(v));

const SENTIMENT = [
  { key: "positive", label: "Positive", color: "var(--sentiment-positive)" },
  { key: "neutral", label: "Neutral", color: "var(--sentiment-neutral)" },
  { key: "negative", label: "Negative", color: "var(--sentiment-negative)" },
] as const;

function MeetingsPerDay({ data }: { data: AnalyticsOverview }) {
  const dense = data.byDay.length > 31;
  return (
    <ChartCard
      title="Meetings per day"
      description="Number of meetings each day"
      className="lg:col-span-2"
      rows={data.byDay}
      columns={[
        { header: "Date", cell: (r) => dayLabel(r.date) },
        { header: "Meetings", cell: (r) => r.meetings, align: "right" },
        { header: "Time", cell: (r) => formatMinutes(r.minutes), align: "right" },
      ]}
      empty={data.totals.meetings === 0 ? <ChartEmpty /> : undefined}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.byDay} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barCategoryGap={dense ? 1 : "20%"}>
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
            <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={48} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={
                <ChartTooltip
                  formatLabel={(label) => dayLabel(String(label))}
                  formatValue={(v, name) => (name === "Meetings" ? v : formatMinutes(Number(v)))}
                />
              }
            />
            <Bar dataKey="meetings" name="Meetings" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function SentimentDonut({ data }: { data: AnalyticsOverview }) {
  const total = SENTIMENT.reduce((sum, s) => sum + (data.sentimentBreakdown[s.key] ?? 0), 0);
  const rows = SENTIMENT.map((s) => ({
    ...s,
    value: data.sentimentBreakdown[s.key] ?? 0,
    pct: total ? Math.round(((data.sentimentBreakdown[s.key] ?? 0) / total) * 100) : 0,
  }));
  return (
    <ChartCard
      title="Sentiment"
      description="Overall tone of your meetings"
      rows={rows}
      columns={[
        { header: "Sentiment", cell: (r) => r.label },
        { header: "Meetings", cell: (r) => r.value, align: "right" },
        { header: "Share", cell: (r) => `${r.pct}%`, align: "right" },
      ]}
      empty={total === 0 ? <ChartEmpty message="Sentiment appears once meetings have reports." /> : undefined}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-44 w-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows.filter((r) => r.value > 0)}
                dataKey="value"
                nameKey="label"
                innerRadius="68%"
                outerRadius="100%"
                paddingAngle={2}
                stroke="var(--card)"
                strokeWidth={2}
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
              >
                {rows
                  .filter((r) => r.value > 0)
                  .map((r) => (
                    <Cell key={r.key} fill={r.color} />
                  ))}
              </Pie>
              <Tooltip content={<ChartTooltip formatLabel={() => "Sentiment"} formatValue={(v) => `${v} meetings`} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{round(data.totals.avgSentimentScore)}</p>
              <p className="text-[11px] text-muted-foreground">avg score</p>
            </div>
          </div>
        </div>
        <ul className="w-full space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: r.color }} aria-hidden="true" />
                {r.label}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {r.value} · {r.pct}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}

function ScoreTrend({ data }: { data: AnalyticsOverview }) {
  const scored = data.byDay.filter((d) => d.avgScore != null);
  return (
    <ChartCard
      title="Meeting score trend"
      description="Average meeting score per day (0–100)"
      className="lg:col-span-2"
      rows={scored}
      columns={[
        { header: "Date", cell: (r) => dayLabel(r.date) },
        { header: "Avg. score", cell: (r) => round(r.avgScore), align: "right" },
      ]}
      empty={scored.length === 0 ? <ChartEmpty message="Scores appear once meetings have reports." /> : undefined}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.byDay} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <defs>
              <linearGradient id="score-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.12} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={AXIS} tickLine={false} axisLine={false} width={48} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeOpacity: 0.4 }}
              content={<ChartTooltip formatLabel={(label) => dayLabel(String(label))} formatValue={(v) => (v == null ? "—" : Math.round(Number(v)))} />}
            />
            <Area type="monotone" dataKey="avgScore" name="Avg. score" stroke="none" fill="url(#score-wash)" connectNulls tooltipType="none" />
            <Line
              type="monotone"
              dataKey="avgScore"
              name="Avg. score"
              stroke="var(--primary)"
              strokeWidth={2}
              connectNulls
              dot={false}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2, fill: "var(--primary)" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function TopTopics({ data }: { data: AnalyticsOverview }) {
  return (
    <ChartCard
      title="Top topics"
      description="Most discussed across your meetings"
      rows={data.topTopics}
      columns={[
        { header: "Topic", cell: (r) => r.topic },
        { header: "Meetings", cell: (r) => r.count, align: "right" },
      ]}
      empty={data.topTopics.length === 0 ? <ChartEmpty message="Topics appear once meetings have reports." /> : undefined}
    >
      <RankedBars items={data.topTopics.map((t) => ({ label: t.topic, value: t.count }))} />
    </ChartCard>
  );
}

function TopParticipants({ data }: { data: AnalyticsOverview }) {
  return (
    <ChartCard
      title="Top participants"
      description="By total talk time"
      rows={data.topParticipants}
      columns={[
        { header: "Name", cell: (r) => r.name },
        { header: "Meetings", cell: (r) => r.meetings, align: "right" },
        { header: "Talk time", cell: (r) => formatDuration(r.talkTimeSeconds), align: "right" },
      ]}
      empty={data.topParticipants.length === 0 ? <ChartEmpty message="Talk time appears once meetings are transcribed." /> : undefined}
    >
      <RankedBars
        items={data.topParticipants.map((p) => ({
          label: p.name,
          value: p.talkTimeSeconds,
          hint: `${p.meetings} meetings`,
        }))}
        formatValue={(v) => formatDuration(v)}
      />
    </ChartCard>
  );
}

function ByHour({ data }: { data: AnalyticsOverview }) {
  return (
    <ChartCard
      title="Meetings by hour of day"
      description="When your meetings start (your timezone)"
      rows={data.byHourOfDay}
      columns={[
        { header: "Hour", cell: (r) => hourLabel(r.hour) },
        { header: "Meetings", cell: (r) => r.meetings, align: "right" },
      ]}
      empty={data.totals.meetings === 0 ? <ChartEmpty /> : undefined}
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.byHourOfDay} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis dataKey="hour" tickFormatter={hourLabel} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={2} />
            <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={48} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={<ChartTooltip formatLabel={(label) => hourLabel(Number(label))} />}
            />
            <Bar dataKey="meetings" name="Meetings" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function Kpis({ data }: { data: AnalyticsOverview }) {
  const t = data.totals;
  const completion = t.actionItemsCreated ? Math.round((t.actionItemsCompleted / t.actionItemsCreated) * 100) : null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard icon={Video} label="Meetings" value={t.meetings} />
      <StatCard icon={Clock} label="Time in meetings" value={formatMinutes(t.totalMinutes)} />
      <StatCard icon={Hourglass} label="Avg. length" value={formatMinutes(t.avgMeetingMinutes)} />
      <StatCard icon={Gauge} label="Avg. meeting score" value={round(t.avgMeetingScore)} />
      <StatCard icon={Zap} label="Avg. engagement" value={round(t.avgEngagementScore)} hint={<span className="inline-flex items-center gap-1"><Smile className="size-3" /> Sentiment {round(t.avgSentimentScore)}</span>} />
      <StatCard
        icon={CheckCircle2}
        label="Action items done"
        value={`${t.actionItemsCompleted}/${t.actionItemsCreated}`}
        hint={completion == null ? "None created" : `${completion}% completed`}
      />
    </div>
  );
}

export function AnalyticsView() {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const analytics = useAnalytics(range);
  const data = analytics.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="How you spend time in meetings and how well they go."
        actions={
          <ToggleGroup
            type="single"
            variant="outline"
            value={range}
            onValueChange={(v) => v && setRange(v as AnalyticsRange)}
            aria-label="Date range"
          >
            {RANGES.map((r) => (
              <ToggleGroupItem key={r.value} value={r.value} className="px-3 text-xs">
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />

      {analytics.isPending ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-80 rounded-xl lg:col-span-2" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </div>
      ) : analytics.isError ? (
        <div className="rounded-xl border bg-card">
          <ErrorState error={analytics.error} onRetry={() => analytics.refetch()} title="Couldn't load analytics" />
        </div>
      ) : data && data.totals.meetings === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={BarChart3}
            title={`No meetings in the last ${RANGES.find((r) => r.value === range)?.label ?? range}`}
            description="Analytics fill in as the notetaker joins your meetings or you upload recordings."
            action={
              range === "90d" ? (
                <AddMeetingDialog />
              ) : (
                <Button variant="outline" onClick={() => setRange("90d")}>
                  Show the last 90 days
                </Button>
              )
            }
          />
        </div>
      ) : data ? (
        <div className={analytics.isPlaceholderData ? "space-y-6 opacity-60 transition-opacity" : "space-y-6"}>
          <Kpis data={data} />
          <div className="grid gap-6 lg:grid-cols-3">
            <MeetingsPerDay data={data} />
            <SentimentDonut data={data} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <ScoreTrend data={data} />
            <TopTopics data={data} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <TopParticipants data={data} />
            <ByHour data={data} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
