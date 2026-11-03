'use client';

import { FilterX } from 'lucide-react';
import { useCallback, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { UrlState } from '@/hooks/use-url-state';

import { SearchInput } from './search-input';

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: ReactNode }[];
  /** Label for the "no filter" option. */
  allLabel?: string;
  className?: string;
}

interface DataTableToolbarProps {
  url: UrlState;
  searchPlaceholder?: string;
  /** Hide the search box when the endpoint has no `q`. */
  search?: boolean;
  filters?: FilterDef[];
  /** Extra controls (date range, user picker…) rendered after the selects. */
  children?: ReactNode;
  /** Keys cleared by "Reset" in addition to `q` and the select filters. */
  extraKeys?: string[];
  actions?: ReactNode;
}

const ALL = '__all__';

/** Search + select filters bound to the URL query string. */
export function DataTableToolbar({
  url,
  searchPlaceholder,
  search = true,
  filters = [],
  children,
  extraKeys = [],
  actions,
}: DataTableToolbarProps) {
  const keys = ['q', ...filters.map((f) => f.key), ...extraKeys];
  const active = keys.some((k) => Boolean(url.get(k)));
  const { set } = url;
  const onSearch = useCallback((q: string) => set({ q }), [set]);

  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {search ? <SearchInput value={url.get('q') ?? ''} onChange={onSearch} placeholder={searchPlaceholder} /> : null}
        {filters.map((filter) => (
          <Select
            key={filter.key}
            value={url.get(filter.key) ?? ALL}
            onValueChange={(v) => set({ [filter.key]: v === ALL ? null : v })}
          >
            <SelectTrigger className={filter.className ?? 'w-40'} aria-label={filter.label}>
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{filter.allLabel ?? `All ${filter.label.toLowerCase()}`}</SelectItem>
              {filter.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {children}
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => set(Object.fromEntries(keys.map((k) => [k, null])))}
          >
            <FilterX /> Reset
          </Button>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
