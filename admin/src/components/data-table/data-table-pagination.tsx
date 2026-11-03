'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { UrlState } from '@/hooks/use-url-state';
import type { PaginationMeta } from '@/lib/api/types';
import { formatNumber } from '@/lib/utils';

const PAGE_SIZES = [10, 20, 50, 100];

export function DataTablePagination({ meta, url }: { meta: PaginationMeta; url: UrlState }) {
  const { page, limit, total } = meta;
  const totalPages = Math.max(1, meta.totalPages);
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const go = (p: number) => url.set({ page: p <= 1 ? null : p }, { resetPage: false });

  return (
    <div className="flex flex-col-reverse items-center justify-between gap-3 px-1 pt-3 sm:flex-row">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0 ? 'No results' : `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)}`}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden text-muted-foreground sm:inline">Rows</span>
          <Select value={String(limit)} onValueChange={(v) => url.set({ limit: v === '20' ? null : v })}>
            <SelectTrigger size="sm" className="w-18" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="First page" disabled={page <= 1} onClick={() => go(1)}>
            <ChevronsLeft />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= totalPages}
            onClick={() => go(page + 1)}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Last page"
            disabled={page >= totalPages}
            onClick={() => go(totalPages)}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
