"use client";

import { Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { StatusChip } from "@/components/meetings/status-chip";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useMeetingSearch } from "@/hooks/queries/use-meetings";
import { formatRelativeDateTime } from "@/lib/format";
import { reportHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Debounced meeting search with a keyboard-navigable results dropdown (combobox pattern). */
export function GlobalSearch({ className }: { className?: string }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const term = useDebouncedValue(value, 300);
  const search = useMeetingSearch(term);
  const results = term.trim().length >= 2 ? (search.data?.items ?? []) : [];
  const showPanel = open && value.trim().length >= 2;

  // "/" focuses the search, like most SaaS apps.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (id: string) => {
    setOpen(false);
    setValue("");
    router.push(reportHref(id));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[Math.min(highlight, results.length - 1)];
      if (target) go(target.id);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full max-w-md", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search meetings"
        placeholder="Search meetings…"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-[var(--radius)] border bg-background pr-9 pl-9 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          {search.isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
        </button>
      ) : (
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:block">
          /
        </kbd>
      )}
      {showPanel && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-[calc(var(--radius)*1.2)] border bg-popover text-popover-foreground shadow-lg">
          <ul id={listId} role="listbox" aria-label="Meeting results" className="max-h-80 overflow-y-auto py-1">
            {search.isPending && term.trim().length >= 2 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">Searching…</li>
            ) : search.isError ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">Search is unavailable right now.</li>
            ) : results.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                {term === value ? `No meetings match “${value.trim()}”.` : "Searching…"}
              </li>
            ) : (
              results.map((m, index) => (
                <li
                  key={m.id}
                  role="option"
                  aria-selected={index === highlight}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(m.id)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5",
                    index === highlight && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{m.title}</span>
                    <span className="block text-xs text-muted-foreground">{formatRelativeDateTime(m.startAt)}</span>
                  </span>
                  <StatusChip status={m.status} size="sm" />
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
