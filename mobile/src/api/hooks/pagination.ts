import type { InfiniteData } from '@tanstack/react-query';

import type { Paginated } from '../types';

export const PAGE_SIZE = 20;

export function nextPageParam<T>(last: Paginated<T>): number | undefined {
  return last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined;
}

/** Flattens infinite pages, dropping duplicates that can appear when items shift between pages. */
export function flattenPages<T extends { id: string }>(data: InfiniteData<Paginated<T>> | undefined): T[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of data.pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
