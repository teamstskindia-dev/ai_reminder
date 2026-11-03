'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Activity, CircleCheck, DatabaseZap, Eye, RefreshCw, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';

import { useAdminSession } from '@/components/auth/admin-session';
import { RoleGate } from '@/components/auth/role-gate';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { JsonView } from '@/components/forms/json-editor';
import { PageHeader } from '@/components/common/page-header';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/common/states';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { queueStatus } from '@/components/system/queue-health-table';
import { QUEUE_META, queueLabel } from '@/components/system/queue-meta';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useListParams } from '@/hooks/use-url-state';
import { useFailedJobs, useFlushCache, useQueues, useRetryFailed } from '@/lib/api/system';
import { QUEUE_NAMES, type FailedJob, type QueueName, type QueueStats } from '@/lib/api/types';
import { cn, formatDateTime, formatNumber, formatRelative, truncate } from '@/lib/utils';

const COUNTS: { key: keyof Pick<QueueStats, 'waiting' | 'active' | 'delayed' | 'failed' | 'completed'>; label: string }[] = [
  { key: 'waiting', label: 'Waiting' },
  { key: 'active', label: 'Active' },
  { key: 'delayed', label: 'Delayed' },
  { key: 'failed', label: 'Failed' },
  { key: 'completed', label: 'Completed' },
];

function RetryButton({ name, failed, size = 'sm' }: { name: QueueName; failed: number; size?: 'sm' | 'default' }) {
  const retry = useRetryFailed();
  return (
    <ConfirmDialog
      title={`Retry failed ${queueLabel(name)} jobs?`}
      description={`All ${formatNumber(failed)} failed job${failed === 1 ? '' : 's'} in “${name}” are moved back to the waiting list and run again.`}
      confirmLabel="Retry failed"
      onConfirm={() => retry.mutateAsync(name)}
      trigger={
        <Button variant="outline" size={size} disabled={failed === 0}>
          <RotateCcw /> Retry failed
        </Button>
      }
    />
  );
}

function QueueCard({ queue, selected, onSelect }: { queue: QueueStats; selected: boolean; onSelect: () => void }) {
  const { can } = useAdminSession();
  const status = queueStatus(queue);
  const meta = QUEUE_META[queue.name];
  return (
    <Card className={cn('gap-4', selected && 'ring-2 ring-primary')}>
      <CardHeader>
        <CardTitle className="text-base">{meta?.label ?? queue.name}</CardTitle>
        <CardDescription className="line-clamp-2">{meta?.description ?? queue.name}</CardDescription>
        <CardAction>
          <StatusBadge status={status.status} label={status.label} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-5 gap-2 text-center">
          {COUNTS.map((c) => (
            <div key={c.key} className="rounded-md bg-muted/50 px-1 py-2">
              <dt className="truncate text-[11px] text-muted-foreground">{c.label}</dt>
              <dd
                className={cn(
                  'text-lg font-semibold tabular-nums',
                  c.key === 'failed' && queue.failed > 0 && 'text-destructive',
                )}
              >
                {formatNumber(queue[c.key])}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{queue.name}</p>
      </CardContent>
      {can('admin') ? (
        <CardFooter className="gap-2">
          <Button variant={selected ? 'secondary' : 'ghost'} size="sm" onClick={onSelect} aria-pressed={selected}>
            <Eye /> View failed
          </Button>
          <RetryButton name={queue.name} failed={queue.failed} />
        </CardFooter>
      ) : null}
    </Card>
  );
}

const failedColumns: ColumnDef<FailedJob>[] = [
  {
    accessorKey: 'id',
    header: 'Job',
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="max-w-56 truncate font-mono text-xs" title={row.original.id}>
          {row.original.id}
        </p>
        <p className="text-xs text-muted-foreground">{row.original.name}</p>
      </div>
    ),
  },
  {
    accessorKey: 'failedReason',
    header: 'Reason',
    cell: ({ row }) => (
      <span className="block max-w-md truncate text-sm text-destructive" title={row.original.failedReason}>
        {truncate(row.original.failedReason || 'Unknown error', 120)}
      </span>
    ),
  },
  {
    accessorKey: 'attemptsMade',
    header: 'Attempts',
    cell: ({ row }) => <span className="tabular-nums">{row.original.attemptsMade}</span>,
  },
  {
    accessorKey: 'timestamp',
    header: 'Created',
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground" title={formatRelative(row.original.timestamp)}>
        {formatDateTime(row.original.timestamp)}
      </span>
    ),
  },
];

function FailedJobsSection({ name }: { name: QueueName }) {
  const { url, page, limit } = useListParams([] as const, { limit: 20 });
  const params = useMemo(() => ({ page, limit }), [page, limit]);
  const jobs = useFailedJobs(name, params);
  const failedCount = jobs.data?.meta.total ?? 0;

  return (
    <section className="mt-8 space-y-4" aria-labelledby="failed-jobs-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="failed-jobs-title" className="text-lg font-semibold">
            Failed jobs · {queueLabel(name)}
          </h2>
          <p className="text-sm text-muted-foreground">Kept for 7 days. Expand a row for the full error and job data.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => url.set({ queue: null, page: null, limit: null })}>
            Close
          </Button>
          <RetryButton name={name} failed={failedCount} />
        </div>
      </div>
      <DataTable
        columns={failedColumns}
        data={jobs.data?.items}
        meta={jobs.data?.meta}
        url={url}
        isLoading={jobs.isPending}
        isFetching={jobs.isFetching}
        error={jobs.error}
        onRetry={() => void jobs.refetch()}
        getRowId={(job) => job.id}
        renderExpanded={(job) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Failure reason</p>
              <pre className="max-h-80 overflow-auto rounded-lg bg-destructive/5 p-3 font-mono text-xs whitespace-pre-wrap text-destructive">
                {job.failedReason || 'Unknown error'}
              </pre>
            </div>
            <div className="min-w-0 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Job data</p>
              <JsonView value={job.data} />
            </div>
          </div>
        )}
        empty={{ icon: <CircleCheck />, title: 'No failed jobs', description: 'Everything in this queue ran successfully.' }}
      />
    </section>
  );
}

export function QueuesView() {
  const { can } = useAdminSession();
  const queues = useQueues({ refetchInterval: 10_000 });
  const flush = useFlushCache();
  const { url, filters } = useListParams(['queue'] as const);
  const selected = QUEUE_NAMES.includes(filters.queue as QueueName) ? (filters.queue as QueueName) : null;

  return (
    <>
      <PageHeader
        title="Queues"
        description="Background jobs: calendar sync, meeting bot, AI processing, notifications and digests."
        meta={
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Auto-refreshing every 10 s
            {queues.dataUpdatedAt ? ` · updated ${formatRelative(queues.dataUpdatedAt)}` : null}
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => void queues.refetch()} disabled={queues.isFetching}>
              <RefreshCw className={cn(queues.isFetching && 'animate-spin')} /> Refresh
            </Button>
            <RoleGate minRole="admin">
              <ConfirmDialog
                title="Flush the config cache?"
                description="Deletes the cached public config, sections, pages and plans in Redis. The website and app get freshly built config on their next request. Safe to run at any time."
                confirmLabel="Flush cache"
                onConfirm={() => flush.mutateAsync()}
                trigger={
                  <Button variant="outline">
                    <DatabaseZap /> Flush config cache
                  </Button>
                }
              />
            </RoleGate>
          </>
        }
      />
      {queues.isPending ? (
        <CardGridSkeleton count={5} />
      ) : queues.isError ? (
        <ErrorState error={queues.error} onRetry={() => void queues.refetch()} />
      ) : queues.data.length === 0 ? (
        <EmptyState icon={<Activity />} title="No queues reported" description="The API did not report any BullMQ queues." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {queues.data.map((queue) => (
            <QueueCard
              key={queue.name}
              queue={queue}
              selected={selected === queue.name}
              onSelect={() =>
                url.set({ queue: selected === queue.name ? null : queue.name, page: null }, { resetPage: false })
              }
            />
          ))}
        </div>
      )}
      {can('admin') ? (
        selected ? (
          <FailedJobsSection key={selected} name={selected} />
        ) : null
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Inspecting and retrying failed jobs requires the Admin role.
        </p>
      )}
    </>
  );
}
