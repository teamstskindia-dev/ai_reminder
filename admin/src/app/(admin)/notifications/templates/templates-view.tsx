'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { BellRing } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { useNotificationTemplates } from '@/lib/api/notifications';
import type { NotificationTemplate } from '@/lib/api/types';
import { formatRelative, truncate } from '@/lib/utils';

import { ChannelBadges } from '../channels';
import { NotificationsNav } from '../notifications-nav';

const columns: ColumnDef<NotificationTemplate>[] = [
  {
    accessorKey: 'name',
    header: 'Template',
    cell: ({ row }) => (
      <div className="min-w-0">
        <Link
          href={`/notifications/templates/${encodeURIComponent(row.original.key)}`}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
        <p className="font-mono text-xs text-muted-foreground">{row.original.key}</p>
      </div>
    ),
  },
  {
    accessorKey: 'titleTemplate',
    header: 'Title',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{truncate(row.original.titleTemplate, 60)}</span>
    ),
  },
  {
    accessorKey: 'channels',
    header: 'Channels',
    cell: ({ row }) => <ChannelBadges channels={row.original.channels} />,
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />,
  },
  {
    accessorKey: 'updatedAt',
    header: 'Updated',
    cell: ({ row }) => <span className="text-muted-foreground">{formatRelative(row.original.updatedAt)}</span>,
  },
];

export function TemplatesView() {
  const templates = useNotificationTemplates();
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Message templates for push, in-app and email. {{variables}} are filled in by the backend."
      />
      <NotificationsNav />
      <DataTable
        columns={columns}
        data={templates.data}
        isLoading={templates.isPending}
        isFetching={templates.isFetching}
        error={templates.error}
        onRetry={() => void templates.refetch()}
        getRowId={(t) => t.key}
        getRowHref={(t) => `/notifications/templates/${encodeURIComponent(t.key)}`}
        skeletonRows={6}
        empty={{ icon: <BellRing />, title: 'No templates', description: 'Seed the database to create the default templates.' }}
      />
    </>
  );
}
