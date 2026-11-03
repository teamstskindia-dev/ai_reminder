'use client';

import { MessageSquareText } from 'lucide-react';
import { useMemo, useState } from 'react';

import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/states';
import { SearchInput } from '@/components/data-table/search-input';
import { useMeetingTranscript } from '@/lib/api/meetings';
import { formatTimestamp } from '@/lib/utils';

/** Fixed speaker colours, assigned in order of first appearance (never cycled by rank). */
const SPEAKER_COLORS = [
  'text-sky-700 dark:text-sky-300',
  'text-orange-700 dark:text-orange-300',
  'text-emerald-700 dark:text-emerald-300',
  'text-violet-700 dark:text-violet-300',
  'text-pink-700 dark:text-pink-300',
  'text-amber-700 dark:text-amber-300',
];

export function TranscriptPanel({ meetingId, enabled }: { meetingId: string; enabled: boolean }) {
  const transcript = useMeetingTranscript(meetingId, enabled);
  const [filter, setFilter] = useState('');

  const speakerColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const seg of transcript.data ?? []) {
      if (!map.has(seg.speaker)) map.set(seg.speaker, SPEAKER_COLORS[map.size % SPEAKER_COLORS.length] ?? '');
    }
    return map;
  }, [transcript.data]);

  const segments = useMemo(() => {
    const all = transcript.data ?? [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((s) => s.text.toLowerCase().includes(needle) || s.speaker.toLowerCase().includes(needle));
  }, [transcript.data, filter]);

  if (transcript.isPending) return <ListSkeleton rows={8} />;
  if (transcript.isError) return <ErrorState error={transcript.error} onRetry={() => void transcript.refetch()} />;
  if (transcript.data.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquareText />}
        title="No transcript"
        description="Captions appear here while the bot is in the call, or after an upload is transcribed."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchInput value={filter} onChange={setFilter} placeholder="Filter transcript" delay={150} />
        <p className="text-sm text-muted-foreground">
          {segments.length} of {transcript.data.length} segments · {speakerColor.size} speaker{speakerColor.size === 1 ? '' : 's'}
        </p>
      </div>
      {segments.length === 0 ? (
        <EmptyState title="No segments match" description="Try a different word or speaker name." />
      ) : (
        <ol className="divide-y rounded-xl border bg-card">
          {segments.map((seg) => (
            <li key={seg.seq} className="flex gap-3 px-4 py-3">
              <span className="mt-0.5 w-12 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {formatTimestamp(seg.startMs)}
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className={`text-xs font-semibold ${speakerColor.get(seg.speaker) ?? ''}`}>{seg.speaker}</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{seg.text}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
