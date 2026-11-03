'use client';

import {
  Activity,
  ArrowUpRight,
  BellRing,
  BrainCircuit,
  CalendarCheck,
  LayoutTemplate,
  ListChecks,
  Megaphone,
  Palette,
  RefreshCw,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { DailyBarChart } from '@/components/charts/daily-bar-chart';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/states';
import { QueueHealthTable } from '@/components/system/queue-health-table';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardStats } from '@/lib/api/dashboard';
import type { AdminDashboardStats } from '@/lib/api/types';
import { cn, formatNumber } from '@/lib/utils';

interface KpiProps {
  title: string;
  value: number;
  icon: LucideIcon;
  href: string;
  details: { label: string; value: number; tone?: 'danger' | 'muted' }[];
}

function KpiCard({ title, value, icon: Icon, href, details }: KpiProps) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4" aria-hidden /> {title}
        </CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{formatNumber(value)}</CardTitle>
        <CardAction>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={href} aria-label={`Open ${title}`}>
              <ArrowUpRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {details.map((d) => (
            <div key={d.label} className="flex items-baseline justify-between gap-2">
              <dt className="truncate text-muted-foreground">{d.label}</dt>
              <dd
                className={cn(
                  'font-medium tabular-nums',
                  d.tone === 'danger' && d.value > 0 && 'text-destructive',
                  d.tone === 'muted' && 'text-muted-foreground',
                )}
              >
                {formatNumber(d.value)}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const QUICK_LINKS: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  { href: '/content/sections', label: 'Edit landing page', description: 'Sections, order and copy', icon: LayoutTemplate },
  { href: '/settings/theme', label: 'Theme & colours', description: 'Preview web and mobile', icon: Palette },
  { href: '/content/banners', label: 'Banners', description: 'Promos on web and app', icon: Megaphone },
  { href: '/ai/playground', label: 'AI playground', description: 'Test the report prompt', icon: BrainCircuit },
  { href: '/notifications/broadcasts', label: 'Send a broadcast', description: 'Push, in-app or email', icon: BellRing },
  { href: '/system/queues', label: 'Queues', description: 'Retry failed jobs', icon: Activity },
];

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function DashboardContent({ stats }: { stats: AdminDashboardStats }) {
  const signups30 = sum(stats.signupsByDay.map((d) => d.count));
  const completed30 = sum(stats.meetingsByDay.map((d) => d.completed));
  const failed30 = sum(stats.meetingsByDay.map((d) => d.failed));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Users"
          value={stats.users.total}
          icon={Users}
          href="/users"
          details={[
            { label: 'New (7d)', value: stats.users.newLast7Days },
            { label: 'Active (7d)', value: stats.users.activeLast7Days },
            { label: 'Suspended', value: stats.users.suspended, tone: 'danger' },
          ]}
        />
        <KpiCard
          title="Meetings"
          value={stats.meetings.total}
          icon={Video}
          href="/meetings"
          details={[
            { label: 'Today', value: stats.meetings.today },
            { label: 'In progress', value: stats.meetings.inProgress },
            { label: 'Processing', value: stats.meetings.processing },
            { label: 'Failed (7d)', value: stats.meetings.failedLast7Days, tone: 'danger' },
          ]}
        />
        <KpiCard
          title="Action items"
          value={stats.actionItems.total}
          icon={ListChecks}
          href="/meetings"
          details={[
            { label: 'Open', value: stats.actionItems.open },
            { label: 'Closed', value: Math.max(0, stats.actionItems.total - stats.actionItems.open), tone: 'muted' },
          ]}
        />
        <KpiCard
          title="Reminders pending"
          value={stats.reminders.pending}
          icon={CalendarCheck}
          href="/notifications"
          details={[{ label: 'Sent (7d)', value: stats.reminders.sentLast7Days }]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Signups per day" description={`${formatNumber(signups30)} new users in the last 30 days`}>
          <DailyBarChart
            data={stats.signupsByDay}
            series={[{ key: 'count', label: 'Signups', color: 'var(--viz-series-1)' }]}
            summary={`Bar chart of daily signups over the last 30 days, ${signups30} in total.`}
          />
        </ChartCard>
        <ChartCard
          title="Meetings per day"
          description={`${formatNumber(completed30)} completed · ${formatNumber(failed30)} failed in the last 30 days`}
        >
          <DailyBarChart
            data={stats.meetingsByDay}
            series={[
              { key: 'completed', label: 'Completed', color: 'var(--viz-series-1)' },
              { key: 'failed', label: 'Failed', color: 'var(--viz-critical)' },
            ]}
            summary={`Stacked bar chart of meetings per day over the last 30 days: ${completed30} completed and ${failed30} failed.`}
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Queue health</CardTitle>
            <CardDescription>BullMQ queues across the API, worker and bot processes</CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" asChild>
                <Link href="/system/queues">Manage queues</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {stats.queues.length ? (
              <QueueHealthTable queues={stats.queues} />
            ) : (
              <p className="text-sm text-muted-foreground">No queue data reported.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick links</CardTitle>
            <CardDescription>Common admin tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1">
              {QUICK_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
                      <link.icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{link.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{link.description}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export function DashboardView() {
  const stats = useDashboardStats();
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Signups, meetings and background jobs at a glance."
        actions={
          <Button variant="outline" size="sm" onClick={() => void stats.refetch()} disabled={stats.isFetching}>
            <RefreshCw className={cn(stats.isFetching && 'animate-spin')} /> Refresh
          </Button>
        }
      />
      {stats.isPending ? (
        <DashboardSkeleton />
      ) : stats.isError ? (
        <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
      ) : (
        <DashboardContent stats={stats.data} />
      )}
    </>
  );
}
