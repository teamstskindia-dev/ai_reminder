"use client";

import { ChevronDown, ChevronUp, FileText, Search, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranscript } from "@/hooks/queries/use-meetings";
import { useDebouncedValue } from "@/hooks/use-debounce";
import type { TranscriptSegment } from "@/lib/api/types";
import { formatTimestamp, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const SPEAKER_COLORS = [
  { text: "text-violet-700 dark:text-violet-300", chip: "bg-violet-500/10" },
  { text: "text-sky-700 dark:text-sky-300", chip: "bg-sky-500/10" },
  { text: "text-emerald-700 dark:text-emerald-300", chip: "bg-emerald-500/10" },
  { text: "text-amber-700 dark:text-amber-300", chip: "bg-amber-500/10" },
  { text: "text-rose-700 dark:text-rose-300", chip: "bg-rose-500/10" },
  { text: "text-teal-700 dark:text-teal-300", chip: "bg-teal-500/10" },
];
type SpeakerColor = (typeof SPEAKER_COLORS)[number];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function Highlighted({ text, regex, activeOffset }: { text: string; regex: RegExp | null; activeOffset: number | null }) {
  if (!regex) return <>{text}</>;
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        // With a single capture group, matches sit at the odd indexes.
        const active = activeOffset === (i - 1) / 2;
        return (
          <mark
            key={i}
            data-active-match={active || undefined}
            className={cn("rounded-sm px-0.5 text-foreground", active ? "bg-amber-400/80 ring-2 ring-amber-500/60" : "bg-amber-300/50 dark:bg-amber-400/30")}
          >
            {part}
          </mark>
        );
      })}
    </>
  );
}

export function TranscriptTab({ meetingId, focusMs, live = false }: { meetingId: string; focusMs: number | null; live?: boolean }) {
  const transcript = useTranscript(meetingId, true, live ? 10_000 : false);
  const [query, setQuery] = useState("");
  const term = useDebouncedValue(query.trim(), 200);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const segments = useMemo(() => transcript.data ?? [], [transcript.data]);

  const speakerColor = useMemo(() => {
    const map = new Map<string, SpeakerColor>();
    for (const s of segments) if (!map.has(s.speaker)) map.set(s.speaker, SPEAKER_COLORS[map.size % SPEAKER_COLORS.length]);
    return map;
  }, [segments]);

  const regex = useMemo(() => (term.length >= 2 ? new RegExp(`(${escapeRegExp(term)})`, "gi") : null), [term]);

  // Global match index → (segment seq, offset inside segment).
  const matches = useMemo(() => {
    if (!regex) return [] as { seq: number; offset: number }[];
    const list: { seq: number; offset: number }[] = [];
    for (const s of segments) {
      const count = s.text.split(regex).length >> 1;
      for (let i = 0; i < count; i++) list.push({ seq: s.seq, offset: i });
    }
    return list;
  }, [segments, regex]);

  const current = matches.length ? matches[Math.min(active, matches.length - 1)] : null;

  useEffect(() => {
    if (!current) return;
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-seq="${current.seq}"] mark[data-active-match]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current]);

  useEffect(() => {
    if (focusMs == null || segments.length === 0) return;
    const target = segments.find((s) => s.startMs >= focusMs) ?? segments[segments.length - 1];
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-seq="${target.seq}"]`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
    el?.classList.add("bg-brand-soft/60");
    const id = setTimeout(() => el?.classList.remove("bg-brand-soft/60"), 1600);
    return () => clearTimeout(id);
  }, [focusMs, segments]);

  const step = (delta: number) => {
    if (!matches.length) return;
    setActive((a) => (a + delta + matches.length) % matches.length);
  };

  if (transcript.isPending) {
    return (
      <div className="space-y-5 rounded-xl border bg-card p-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (transcript.isError) {
    return (
      <div className="rounded-xl border bg-card">
        <ErrorState error={transcript.error} onRetry={() => transcript.refetch()} title="Couldn't load the transcript" />
      </div>
    );
  }
  if (segments.length === 0) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState icon={FileText} title="No transcript yet" description="Captions appear here while the notetaker is in the call." />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-sm text-muted-foreground">
          {segments.length} segments · {speakerColor.size} speakers
        </p>
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  step(e.shiftKey ? -1 : 1);
                }
              }}
              placeholder="Search transcript"
              aria-label="Search transcript"
              className="pr-8 pl-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <span className="w-16 text-center text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {regex ? (matches.length ? `${Math.min(active, matches.length - 1) + 1}/${matches.length}` : "0/0") : ""}
          </span>
          <Button variant="outline" size="icon-sm" onClick={() => step(-1)} disabled={!matches.length} aria-label="Previous match">
            <ChevronUp />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => step(1)} disabled={!matches.length} aria-label="Next match">
            <ChevronDown />
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="max-h-[70vh] overflow-y-auto">
        {segments.map((segment: TranscriptSegment, index) => {
          const sameSpeaker = index > 0 && segments[index - 1].speaker === segment.speaker;
          const color = speakerColor.get(segment.speaker) ?? SPEAKER_COLORS[0];
          return (
            <div
              key={segment.seq}
              data-seq={segment.seq}
              className={cn("flex gap-3 px-4 py-3 transition-colors sm:px-5", index > 0 && !sameSpeaker && "border-t", sameSpeaker && "pt-0")}
            >
              <span
                className={cn("grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold", color.text, color.chip, sameSpeaker && "invisible")}
                aria-hidden={sameSpeaker}
              >
                {initials(segment.speaker)}
              </span>
              <div className="min-w-0 flex-1">
                {!sameSpeaker && (
                  <p className="mb-0.5 flex items-baseline gap-2">
                    <span className={cn("text-sm font-semibold", color.text)}>{segment.speaker}</span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatTimestamp(segment.startMs)}</span>
                  </p>
                )}
                <p className="text-sm leading-relaxed">
                  <Highlighted
                    text={segment.text}
                    regex={regex}
                    activeOffset={current && current.seq === segment.seq ? current.offset : null}
                  />
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
