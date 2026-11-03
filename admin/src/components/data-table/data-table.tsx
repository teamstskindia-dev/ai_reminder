'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Updater,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useMemo, useState, type ReactNode } from 'react';

import { EmptyState, ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { UrlState } from '@/hooks/use-url-state';
import type { PaginationMeta } from '@/lib/api/types';
import { cn } from '@/lib/utils';

import { DataTablePagination } from './data-table-pagination';

export interface DataTableEmpty {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[] | undefined;
  /** Server pagination meta; omit for non-paginated endpoints. */
  meta?: PaginationMeta;
  /** URL state used for pagination + server-side sorting (`sort=field:asc|desc`). */
  url?: UrlState;
  isLoading: boolean;
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: DataTableEmpty;
  getRowId?: (row: TData) => string;
  /** Navigate when a row is clicked (the primary cell should also contain a real link for keyboard users). */
  getRowHref?: (row: TData) => string;
  /** Expandable rows: content rendered under the row. */
  renderExpanded?: (row: TData) => ReactNode;
  skeletonRows?: number;
  className?: string;
}

function parseSort(sort: string | null): SortingState {
  if (!sort) return [];
  const [id, dir] = sort.split(':');
  return id ? [{ id, desc: dir === 'desc' }] : [];
}

export function DataTable<TData>({
  columns,
  data,
  meta,
  url,
  isLoading,
  isFetching,
  error,
  onRetry,
  empty = { title: 'Nothing here yet' },
  getRowId,
  getRowHref,
  renderExpanded,
  skeletonRows,
  className,
}: DataTableProps<TData>) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const sortParam = url?.get('sort') ?? null;
  const sorting = useMemo(() => parseSort(sortParam), [sortParam]);
  const rows = useMemo(() => data ?? [], [data]);

  const allColumns = useMemo<ColumnDef<TData>[]>(() => {
    if (!renderExpanded) return columns;
    return [
      {
        id: '__expand',
        header: () => <span className="sr-only">Expand</span>,
        size: 32,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={expanded[row.id] ? 'Collapse row' : 'Expand row'}
            aria-expanded={Boolean(expanded[row.id])}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }));
            }}
          >
            <ChevronRight className={cn('transition-transform', expanded[row.id] && 'rotate-90')} />
          </Button>
        ),
      },
      ...columns,
    ];
  }, [columns, renderExpanded, expanded]);

  // TanStack Table returns non-memoizable functions; this component never passes them to memoized children.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    manualSorting: true,
    manualPagination: true,
    enableSortingRemoval: true,
    defaultColumn: { enableSorting: false },
    state: { sorting },
    onSortingChange: (updater: Updater<SortingState>) => {
      if (!url) return;
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const first = next[0];
      url.set({ sort: first ? `${first.id}:${first.desc ? 'desc' : 'asc'}` : null });
    },
  });

  const colCount = table.getVisibleLeafColumns().length;
  const showSkeleton = isLoading && rows.length === 0;

  return (
    <div className={className}>
      <div
        className={cn(
          'overflow-hidden rounded-xl border bg-card transition-opacity',
          isFetching && !isLoading && 'opacity-70',
        )}
        aria-busy={isLoading || isFetching}
      >
        <Table>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const content = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext());
                  return (
                    <TableHead
                      key={header.id}
                      style={header.column.columnDef.size !== 150 ? { width: header.column.columnDef.size } : undefined}
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                      className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      {canSort ? (
                        <button
                          type="button"
                          className="-ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 uppercase hover:bg-muted hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {content}
                          {sorted === 'asc' ? (
                            <ArrowUp className="size-3.5" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-50" />
                          )}
                        </button>
                      ) : (
                        content
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {showSkeleton ? (
              Array.from({ length: skeletonRows ?? Math.min(meta?.limit ?? 8, 10) }, (_, i) => (
                <TableRow key={`s-${i}`} className="hover:bg-transparent">
                  {Array.from({ length: colCount }, (_, j) => (
                    <TableCell key={j}>
                      <Skeleton className={cn('h-4', j === 0 ? 'w-40' : 'w-20')} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error && rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colCount} className="p-4">
                  <ErrorState error={error} onRetry={onRetry} className="border-0" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colCount} className="p-4">
                  <EmptyState {...empty} className="border-0" />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const href = getRowHref?.(row.original);
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className={cn(href && 'cursor-pointer')}
                      onClick={(e) => {
                        if (!href) return;
                        const target = e.target as HTMLElement;
                        if (target.closest('a,button,input,[role="checkbox"],[role="switch"],[data-no-row-click]')) return;
                        if (e.metaKey || e.ctrlKey) window.open(href, '_blank');
                        else router.push(href);
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                    {renderExpanded && expanded[row.id] ? (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={colCount} className="p-4 whitespace-normal">
                          {renderExpanded(row.original)}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {meta && url && meta.total > 0 ? <DataTablePagination meta={meta} url={url} /> : null}
    </div>
  );
}
