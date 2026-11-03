export interface TalkSegment {
  speaker: string;
  text: string;
  startMs: number;
  endMs: number | null;
}

export interface SpeakerStats {
  name: string;
  talkTimeSeconds: number;
  wordCount: number;
  /** Share of all spoken words, 0..100 with two decimals. */
  talkRatio: number;
}

const MS_PER_WORD = 400;

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * Talk time / word count / talk ratio per speaker, computed locally from transcript segments
 * (never by the LLM). Segment duration = endMs - startMs; when unknown it is estimated from the
 * word count and capped by the next segment's start.
 */
export function computeTalkStats(segments: TalkSegment[]): SpeakerStats[] {
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  const bySpeaker = new Map<string, { ms: number; words: number; label: string }>();
  let totalWords = 0;

  sorted.forEach((seg, i) => {
    const words = countWords(seg.text);
    let duration: number;
    if (seg.endMs !== null && seg.endMs > seg.startMs) {
      duration = seg.endMs - seg.startMs;
    } else {
      duration = words * MS_PER_WORD;
      const next = sorted[i + 1];
      if (next && next.startMs > seg.startMs) duration = Math.min(duration, next.startMs - seg.startMs);
    }
    const label = seg.speaker.trim() || 'Unknown';
    const key = label.toLowerCase();
    const entry = bySpeaker.get(key) ?? { ms: 0, words: 0, label };
    entry.ms += duration;
    entry.words += words;
    bySpeaker.set(key, entry);
    totalWords += words;
  });

  return [...bySpeaker.values()]
    .map((e) => ({
      name: e.label,
      talkTimeSeconds: Math.round(e.ms / 1000),
      wordCount: e.words,
      talkRatio: totalWords > 0 ? Math.round((e.words / totalWords) * 10_000) / 100 : 0,
    }))
    .sort((a, b) => b.talkTimeSeconds - a.talkTimeSeconds || b.wordCount - a.wordCount);
}

/** Meeting duration estimate from segments (last end − first start), in seconds. */
export function transcriptDurationSeconds(segments: TalkSegment[]): number {
  if (!segments.length) return 0;
  const start = Math.min(...segments.map((s) => s.startMs));
  const end = Math.max(...segments.map((s) => s.endMs ?? s.startMs + countWords(s.text) * MS_PER_WORD));
  return Math.max(0, Math.round((end - start) / 1000));
}
