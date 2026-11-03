'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export type UrlUpdates = Record<string, string | number | null | undefined>;

/**
 * Read/write query-string state (filters, pagination, tabs). Updates use `router.replace` so the
 * back button is not flooded, and any filter change resets `page` unless told otherwise.
 */
export function useUrlState() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const get = useCallback((key: string): string | null => searchParams.get(key), [searchParams]);

  const set = useCallback(
    (updates: UrlUpdates, options?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      if (options?.resetPage !== false && !('page' in updates)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return useMemo(() => ({ searchParams, get, set }), [searchParams, get, set]);
}

export type UrlState = ReturnType<typeof useUrlState>;

/** Standard list state: page, limit, q, sort plus named filters, all read from the URL. */
export function useListParams<F extends string>(filterKeys: readonly F[], defaults?: { limit?: number; sort?: string }) {
  const url = useUrlState();
  const page = Math.max(1, Number(url.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.get('limit')) || defaults?.limit || 20));
  const q = url.get('q') ?? '';
  const sort = url.get('sort') ?? defaults?.sort ?? '';
  const filterJson = JSON.stringify(filterKeys.map((k) => [k, url.get(k) ?? '']));

  const filters = useMemo(() => {
    const result = {} as Record<F, string | undefined>;
    for (const [key, value] of JSON.parse(filterJson) as [F, string][]) {
      result[key] = value || undefined;
    }
    return result;
  }, [filterJson]);

  return { url, page, limit, q, sort, filters };
}
