"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaginationMeta } from "@/lib/api/types";

export function Pager({
  meta,
  onPageChange,
  disabled,
}: {
  meta: PaginationMeta | undefined;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  if (!meta || meta.totalPages <= 1) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
      <p className="text-xs text-muted-foreground">
        {from}–{to} of {meta.total}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={disabled || meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>
          <ChevronLeft /> Previous
        </Button>
        <span className="px-2 text-xs text-muted-foreground tabular-nums">
          {meta.page} / {meta.totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={disabled || meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>
          Next <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
