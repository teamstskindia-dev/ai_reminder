'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Video } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { UserPicker } from '@/components/common/user-picker';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useListParams } from '@/hooks/use-url-state';
import { useMeetings } from '@/lib/api/meetings';
import { MEETING_STATUSES, type AdminMeetingListItem, type MeetingStatus } from '@/lib/api/types';
import { dayToIso, formatDateTime, formatDuration, formatNumber, humanize } from '@/lib/utils';

export const PLATFORM_LABELS: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  teams: 'Teams',
  other: 'Other',
};

const columns: ColumnDef<AdminMeetingListItem>[] = [
  {
    accessorKey: 'title',
    header: 'Meeting',
    cell: ({ row }) => (
      <div className="max-w-72 min-w-0">
        <Link href={`/meetings/${row.original.id}`} className="block truncate font-medium hover:underline">
          {row.original.title || 'Untitled meeting'}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {PLATFORM_LABELS[row.original.platform] ?? humanize(row.original.platform)} · {humanize(row.original.source)}
        </p>
      </div>
    ),
  },
  {
    id: 'user',
    header: 'User',
    cell: ({ row }) => (
      <Link
        href={`/users/${row.original.user.id}`}
        className="block max-w-48 truncate text-sm hover:underline"
        title={row.original.user.email}
      >
        {row.original.user.name ?? row.original.user.email}
      </Link>
    ),
  },
  {
    accessorKey: 'startAt',
    header: 'Start',
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.startAt)}</span>,
  },
  {
    accessorKey: 'durationSeconds',
    header: 'Duration',
    cell: ({ row }) => <span className="tabular-nums">{formatDuration(row.original.durationSeconds)}</span>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const badge = <StatusBadge status={row.original.status} />;
      if (row.original.status !== 'failed' || !row.original.failureReason) return badge;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex cursor-help rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              {badge}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{row.original.failureReason}</TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: 'actionItemCount',
    header: 'Action items',
    cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.actionItemCount)}</span>,
  },
  {
    id: 'score',
    header: 'Score',
    cell: ({ row }) => {
      const score = row.original.report?.meetingScore;
      return score === null || score === undefined ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="font-medium tabular-nums">{score}</span>
      );
    },
  },
];

export function MeetingsView() {
  // GET /admin/meetings has no `sort` parameter (the API returns newest first), so no sortable columns here.
  const { url, page, limit, q, filters } = useListParams(['status', 'userId', 'from', 'to'] as const);
  const params = useMemo(
    () => ({
      q: q || undefined,
      status: filters.status as MeetingStatus | undefined,
      userId: filters.userId,
      from: dayToIso(filters.from, 'start'),
      to: dayToIso(filters.to, 'end'),
      page,
      limit,
    }),
    [q, filters, page, limit],
  );
  const meetings = useMeetings(params);
  const filtered = Boolean(q || filters.status || filters.userId || filters.from || filters.to);

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Every meeting the bot joined or a user uploaded. Inspect reports and transcripts, reprocess failures."
      />
      <DataTableToolbar
        url={url}
        searchPlaceholder="Search titles"
        extraKeys={['userId', 'from', 'to']}
        filters={[
          {
            key: 'status',
            label: 'Statuses',
            options: MEETING_STATUSES.map((s) => ({ value: s, label: humanize(s) })),
            className: 'w-40',
          },
        ]}
      >
        <UserPicker
          value={filters.userId ?? null}
          onChange={(user) => url.set({ userId: user?.id ?? null })}
          placeholder="All users"
        />
        <div className="flex items-center gap-1.5">
          <Label htmlFor="meetings-from" className="sr-only">
            From date
          </Label>
          <Input
            id="meetings-from"
            type="date"
            className="w-38"
            value={filters.from ?? ''}
            max={filters.to}
            onChange={(e) => url.set({ from: e.target.value || null })}
          />
          <span className="text-sm text-muted-foreground" aria-hidden>
            –
          </span>
          <Label htmlFor="meetings-to" className="sr-only">
            To date
          </Label>
          <Input
            id="meetings-to"
            type="date"
            className="w-38"
            value={filters.to ?? ''}
            min={filters.from}
            onChange={(e) => url.set({ to: e.target.value || null })}
          />
        </div>
      </DataTableToolbar>
      <DataTable
        columns={columns}
        data={meetings.data?.items}
        meta={meetings.data?.meta}
        url={url}
        isLoading={meetings.isPending}
        isFetching={meetings.isFetching}
        error={meetings.error}
        onRetry={() => void meetings.refetch()}
        getRowId={(m) => m.id}
        getRowHref={(m) => `/meetings/${m.id}`}
        empty={{
          icon: <Video />,
          title: filtered ? 'No meetings match these filters' : 'No meetings yet',
          description: 'Meetings appear once users connect Google Calendar or upload a recording.',
        }}
      />
    </>
  );
}
