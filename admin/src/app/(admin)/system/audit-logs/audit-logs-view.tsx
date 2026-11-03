'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Lock, ScrollText } from 'lucide-react';
import { useMemo } from 'react';

import { useAdminSession } from '@/components/auth/admin-session';
import { CopyButton } from '@/components/common/copy-button';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/states';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar, type FilterDef } from '@/components/data-table/data-table-toolbar';
import { JsonDiff } from '@/components/system/json-diff';
import { Badge } from '@/components/ui/badge';
import { useListParams } from '@/hooks/use-url-state';
import { useAdmins } from '@/lib/api/admins';
import { useAuditLogs } from '@/lib/api/audit-logs';
import type { AuditLog } from '@/lib/api/types';
import { formatDateTime, formatRelative, humanize } from '@/lib/utils';

const KNOWN_ENTITIES = [
  'settings',
  'section',
  'page',
  'navigation',
  'banner',
  'plan',
  'media',
  'ai_prompt',
  'notification_template',
  'broadcast',
  'user',
  'meeting',
  'admin',
  'queue',
  'cache',
];

const columns: ColumnDef<AuditLog>[] = [
  {
    accessorKey: 'createdAt',
    header: 'Time',
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        <p className="text-sm">{formatDateTime(row.original.createdAt)}</p>
        <p className="text-xs text-muted-foreground">{formatRelative(row.original.createdAt)}</p>
      </div>
    ),
  },
  {
    id: 'admin',
    header: 'Admin',
    cell: ({ row }) =>
      row.original.admin ? (
        <div className="max-w-48 min-w-0">
          <p className="truncate text-sm font-medium">{row.original.admin.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.admin.email}</p>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">System</span>
      ),
  },
  {
    accessorKey: 'action',
    header: 'Action',
    cell: ({ row }) => (
      <Badge variant="outline" className="font-mono text-xs">
        {row.original.action}
      </Badge>
    ),
  },
  {
    accessorKey: 'entity',
    header: 'Entity',
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0">
          <p className="text-sm">{humanize(row.original.entity)}</p>
          {row.original.entityId ? (
            <p className="max-w-40 truncate font-mono text-xs text-muted-foreground" title={row.original.entityId}>
              {row.original.entityId}
            </p>
          ) : null}
        </div>
        {row.original.entityId ? <CopyButton value={row.original.entityId} label="Copy entity ID" size="icon-xs" /> : null}
      </div>
    ),
  },
  {
    accessorKey: 'ip',
    header: 'IP',
    cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.ip ?? '—'}</span>,
  },
];

export function AuditLogsView() {
  const { can, isLoading: sessionLoading } = useAdminSession();
  const allowed = can('admin');
  const isSuperAdmin = can('super_admin');
  const { url, page, limit, filters } = useListParams(['entity', 'adminId'] as const, { limit: 50 });
  const params = useMemo(
    () => ({ entity: filters.entity, adminId: filters.adminId, page, limit }),
    [filters, page, limit],
  );
  const logs = useAuditLogs(params, { enabled: allowed });
  const admins = useAdmins({ enabled: isSuperAdmin });

  const entityOptions = useMemo(() => {
    const values = new Set(KNOWN_ENTITIES);
    if (filters.entity) values.add(filters.entity);
    return [...values].map((v) => ({ value: v, label: humanize(v) }));
  }, [filters.entity]);

  const filterDefs: FilterDef[] = [{ key: 'entity', label: 'Entities', options: entityOptions, className: 'w-48' }];
  if (isSuperAdmin) {
    filterDefs.push({
      key: 'adminId',
      label: 'Admins',
      options: (admins.data ?? []).map((a) => ({ value: a.id, label: a.name })),
      className: 'w-48',
    });
  }

  if (!sessionLoading && !allowed) {
    return (
      <>
        <PageHeader title="Audit logs" />
        <EmptyState
          icon={<Lock />}
          title="You do not have access"
          description="Audit logs are available to the Admin and Super admin roles."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Every change made from this admin panel: who, what, when and the before/after values."
      />
      <DataTableToolbar url={url} search={false} filters={filterDefs} />
      <DataTable
        columns={columns}
        data={logs.data?.items}
        meta={logs.data?.meta}
        url={url}
        isLoading={logs.isPending}
        isFetching={logs.isFetching}
        error={logs.error}
        onRetry={() => void logs.refetch()}
        getRowId={(log) => String(log.id)}
        renderExpanded={(log) => <JsonDiff changes={log.changes} />}
        empty={{
          icon: <ScrollText />,
          title: filters.entity || filters.adminId ? 'No entries match these filters' : 'No audit entries yet',
          description: 'Entries are written whenever an admin changes something.',
        }}
      />
    </>
  );
}
