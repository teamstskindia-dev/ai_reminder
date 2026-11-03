'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink, FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { RoleGate } from '@/components/auth/role-gate';
import { cmsPageUrl } from '@/components/cms/web-url';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
import { useListParams } from '@/hooks/use-url-state';
import { useCmsPages } from '@/lib/api/pages';
import type { CmsPage, CmsPageStatus } from '@/lib/api/types';
import { formatDate, formatRelative } from '@/lib/utils';
import { SafeLink } from '@/components/common/safe-link';

const columns: ColumnDef<CmsPage>[] = [
  {
    accessorKey: 'title',
    header: 'Title',
    cell: ({ row }) => (
      <Link href={`/content/pages/${row.original.id}`} className="font-medium hover:underline">
        {row.original.title}
      </Link>
    ),
  },
  {
    accessorKey: 'slug',
    header: 'URL',
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono text-xs text-muted-foreground">/p/{row.original.slug}</span>
        {row.original.status === 'published' ? (
          <SafeLink
            href={cmsPageUrl(row.original.slug)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Open /p/${row.original.slug} on the website`}
          >
            <ExternalLink className="size-3.5" />
          </SafeLink>
        ) : null}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'publishedAt',
    header: 'Published',
    cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.publishedAt)}</span>,
  },
  {
    accessorKey: 'updatedAt',
    header: 'Updated',
    cell: ({ row }) => (
      <span className="text-muted-foreground" title={row.original.updatedAt}>
        {formatRelative(row.original.updatedAt)}
      </span>
    ),
  },
];

export function PagesView() {
  const { url, page, limit, q, filters } = useListParams(['status'] as const);
  const params = useMemo(
    () => ({ q: q || undefined, status: filters.status as CmsPageStatus | undefined, page, limit }),
    [q, filters, page, limit],
  );
  const pages = useCmsPages(params);

  return (
    <>
      <PageHeader
        title="Pages"
        description="Markdown pages served by the website at /p/{slug} — about, privacy policy, terms and anything else."
        actions={
          <RoleGate minRole="editor">
            <Button asChild>
              <Link href="/content/pages/new">
                <Plus /> New page
              </Link>
            </Button>
          </RoleGate>
        }
      />
      <DataTableToolbar
        url={url}
        searchPlaceholder="Search title or slug"
        filters={[
          {
            key: 'status',
            label: 'Statuses',
            options: [
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
            ],
            className: 'w-36',
          },
        ]}
      />
      <DataTable
        columns={columns}
        data={pages.data?.items}
        meta={pages.data?.meta}
        url={url}
        isLoading={pages.isPending}
        isFetching={pages.isFetching}
        error={pages.error}
        onRetry={() => void pages.refetch()}
        getRowId={(p) => p.id}
        getRowHref={(p) => `/content/pages/${p.id}`}
        empty={{
          icon: <FileText />,
          title: q || filters.status ? 'No pages match these filters' : 'No pages yet',
          description: 'Create a page and link to it from Navigation (e.g. /p/about).',
        }}
      />
    </>
  );
}
