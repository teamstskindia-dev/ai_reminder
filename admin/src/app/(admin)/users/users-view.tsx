'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { CalendarCheck, CalendarX, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useListParams } from '@/hooks/use-url-state';
import { usePlans } from '@/lib/api/plans';
import type { AdminUserListItem, UserStatus } from '@/lib/api/types';
import { useUsers } from '@/lib/api/users';
import { formatDate, formatNumber, formatRelative, initials } from '@/lib/utils';
import { SafeAvatarImage } from '@/components/common/safe-avatar-image';

export function UserIdentity({ user }: { user: Pick<AdminUserListItem, 'id' | 'name' | 'email' | 'avatarUrl'> }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-8">
        <SafeAvatarImage src={user.avatarUrl} />
        <AvatarFallback className="text-xs">{initials(user.name ?? user.email)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <Link href={`/users/${user.id}`} className="block truncate font-medium hover:underline">
          {user.name ?? user.email}
        </Link>
        {user.name ? <p className="truncate text-xs text-muted-foreground">{user.email}</p> : null}
      </div>
    </div>
  );
}

const columns: ColumnDef<AdminUserListItem>[] = [
  {
    accessorKey: 'email',
    header: 'User',
    cell: ({ row }) => <UserIdentity user={row.original} />,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: 'plan',
    header: 'Plan',
    cell: ({ row }) =>
      row.original.plan ? (
        <Badge variant="outline">{row.original.plan.name}</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: 'calendarConnected',
    header: 'Calendar',
    cell: ({ row }) =>
      row.original.calendarConnected ? (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <CalendarCheck className="size-4 text-emerald-600" aria-hidden /> Connected
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarX className="size-4" aria-hidden /> Not connected
        </span>
      ),
  },
  {
    accessorKey: 'meetingsCount',
    header: 'Meetings',
    cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.meetingsCount)}</span>,
  },
  {
    accessorKey: 'lastLoginAt',
    header: 'Last login',
    enableSorting: true,
    cell: ({ row }) => (
      <span className="text-muted-foreground" title={row.original.lastLoginAt ?? undefined}>
        {formatRelative(row.original.lastLoginAt)}
      </span>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Joined',
    enableSorting: true,
    cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
  },
];

export function UsersView() {
  const { url, page, limit, q, sort, filters } = useListParams(['status', 'planId'] as const, {
    sort: 'createdAt:desc',
  });
  const plans = usePlans();
  const params = useMemo(
    () => ({
      q: q || undefined,
      status: filters.status as UserStatus | undefined,
      planId: filters.planId,
      page,
      limit,
      sort,
    }),
    [q, filters, page, limit, sort],
  );
  const users = useUsers(params);

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who signed in to the website or Android app. Change plans, suspend accounts and inspect their data."
      />
      <DataTableToolbar
        url={url}
        searchPlaceholder="Search name or email"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
            ],
            className: 'w-36',
          },
          {
            key: 'planId',
            label: 'Plans',
            options: (plans.data ?? []).map((p) => ({ value: p.id, label: p.name })),
          },
        ]}
      />
      <DataTable
        columns={columns}
        data={users.data?.items}
        meta={users.data?.meta}
        url={url}
        isLoading={users.isPending}
        isFetching={users.isFetching}
        error={users.error}
        onRetry={() => void users.refetch()}
        getRowId={(u) => u.id}
        getRowHref={(u) => `/users/${u.id}`}
        empty={{
          icon: <Users />,
          title: q || filters.status || filters.planId ? 'No users match these filters' : 'No users yet',
          description: 'Users appear here after they sign in with Google on the website or app.',
        }}
      />
    </>
  );
}
