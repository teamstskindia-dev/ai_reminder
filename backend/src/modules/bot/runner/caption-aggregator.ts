/**
 * Merges Google Meet's progressive live-caption updates into transcript segments.
 *
 * Meet re-renders a speaker's caption block as recognition progresses: the text grows word by
 * word, tail words get revised, and long blocks scroll (older words drop off the front). Each
 * update arrives here as (speaker, full visible block text). Updates that continue an open
 * segment of the same speaker update it; anything else starts a new segment. Segments are
 * finalised once idle (or when they get too long) and receive increasing sequence numbers.
 *
 * Pure and dependency-free (unit tested).
 */

export interface FinalSegment {
  seq: number;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
}

export interface CaptionAggregatorOptions {
  /** Epoch ms that maps to transcript time 0 (usually when the bot entered the call). */
  meetingStartMs: number;
  /** Finalise a segment after this long without updates. */
  idleMs?: number;
  /** Finalise a segment once it spans this long (keeps segments reasonably short). */
  maxSegmentMs?: number;
  /** First sequence number to assign (to continue an existing transcript). */
  startSeq?: number;
}

interface OpenSegment {
  speaker: string;
  /** Text captured by this segment. */
  text: string;
  /** Words of the same Meet block already emitted by earlier (finalised) segments. */
  prefix: string;
  startMs: number;
  endMs: number;
  lastUpdateMs: number;
}

function visibleText(seg: OpenSegment): string {
  return seg.prefix ? `${seg.prefix} ${seg.text}` : seg.text;
}

interface FinalTail {
  text: string;
  finalizedAtMs: number;
}

const MIN_OVERLAP_CHARS = 20;
const REVISION_RATIO = 0.6;
/** How long a finalised segment can still absorb late updates of the same Meet block. */
const TAIL_MEMORY_MS = 30_000;

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function words(text: string): string[] {
  return normalizeWhitespace(text).split(' ').filter(Boolean);
}

function normWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

function charLength(ws: string[]): number {
  return ws.reduce((n, w) => n + w.length, 0) + Math.max(0, ws.length - 1);
}

/** a is a (word-wise) prefix of b; the last word of a may be a partial word of b. */
function isWordPrefix(a: string[], b: string[]): boolean {
  if (a.length === 0 || a.length > b.length) return false;
  for (let i = 0; i < a.length - 1; i++) if (a[i] !== b[i]) return false;
  const last = a.length - 1;
  return b[last].startsWith(a[last]);
}

function commonPrefixWords(a: string[], b: string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Largest k such that the last k words of a equal the first k words of b (k ≥ 1), else 0. */
function suffixPrefixOverlap(a: string[], b: string[]): number {
  for (let k = Math.min(a.length, b.length); k >= 1; k--) {
    let ok = true;
    for (let i = 0; i < k; i++) {
      if (a[a.length - k + i] !== b[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return k;
  }
  return 0;
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

export type MergeResult =
  | { kind: 'replace'; text: string } // extension or revision: new text supersedes the old one
  | { kind: 'append'; text: string } // rolling window: old text + only the new words
  | { kind: 'same' } // stale/duplicate update fully contained in the old text
  | { kind: 'new' }; // not a continuation

/** Decides how `next` relates to `prev` (both raw caption texts of the same speaker). */
export function mergeCaption(prev: string, next: string): MergeResult {
  const prevWords = words(prev);
  const nextWords = words(next);
  const a = prevWords.map(normWord);
  const b = nextWords.map(normWord);
  if (!b.length) return { kind: 'same' };
  if (!a.length) return { kind: 'replace', text: nextWords.join(' ') };

  if (isWordPrefix(a, b)) return { kind: 'replace', text: nextWords.join(' ') };
  if (isWordPrefix(b, a) || containsSequence(a, b)) {
    // A shorter replay of what we already have (or a window inside it).
    if (b.length === a.length) return { kind: 'replace', text: nextWords.join(' ') };
    if (isWordPrefix(b, a) || charLength(nextWords) >= MIN_OVERLAP_CHARS) return { kind: 'same' };
  }

  const shorter = Math.min(a.length, b.length);
  const common = commonPrefixWords(a, b);
  if (common >= 1 && common >= Math.ceil(shorter * REVISION_RATIO)) {
    return { kind: 'replace', text: nextWords.join(' ') };
  }

  const k = suffixPrefixOverlap(a, b);
  if (k > 0 && charLength(nextWords.slice(0, k)) >= MIN_OVERLAP_CHARS) {
    const extra = nextWords.slice(k);
    return extra.length ? { kind: 'append', text: `${prevWords.join(' ')} ${extra.join(' ')}` } : { kind: 'same' };
  }
  return { kind: 'new' };
}

/** Words of `next` that were not already captured in a finalised `prev` (null if unrelated). */
function remainderAfter(prev: string, next: string): string | null {
  const prevWords = words(prev);
  const nextWords = words(next);
  const a = prevWords.map(normWord);
  const b = nextWords.map(normWord);
  if (!a.length || !b.length) return null;
  if (isWordPrefix(a, b)) return nextWords.slice(a.length).join(' ');
  if (isWordPrefix(b, a) || (containsSequence(a, b) && charLength(nextWords) >= MIN_OVERLAP_CHARS)) return '';
  const k = suffixPrefixOverlap(a, b);
  if (k > 0 && charLength(nextWords.slice(0, k)) >= MIN_OVERLAP_CHARS) return nextWords.slice(k).join(' ');
  return null;
}

export class CaptionAggregator {
  private readonly meetingStartMs: number;
  private readonly idleMs: number;
  private readonly maxSegmentMs: number;
  private nextSeq: number;
  private open: OpenSegment[] = [];
  private readonly tails = new Map<string, FinalTail>();

  constructor(opts: CaptionAggregatorOptions) {
    this.meetingStartMs = opts.meetingStartMs;
    this.idleMs = opts.idleMs ?? 3500;
    this.maxSegmentMs = opts.maxSegmentMs ?? 60_000;
    this.nextSeq = opts.startSeq ?? 0;
  }

  /** Number of segments not yet finalised. */
  get openCount(): number {
    return this.open.length;
  }

  push(speaker: string, text: string, nowMs: number): void {
    const clean = normalizeWhitespace(text);
    if (!clean) return;
    const who = normalizeWhitespace(speaker) || 'Unknown';
    const rel = Math.max(0, nowMs - this.meetingStartMs);

    // Most recent open segments of this speaker first.
    for (let i = this.open.length - 1; i >= 0; i--) {
      const seg = this.open[i];
      if (seg.speaker !== who) continue;
      const merged = mergeCaption(visibleText(seg), clean);
      if (merged.kind === 'new') continue;
      if (merged.kind !== 'same') {
        if (!seg.prefix) seg.text = merged.text;
        else {
          const rest = remainderAfter(seg.prefix, merged.text);
          const prefixWords = words(seg.prefix).length;
          const fallback = words(merged.text).slice(prefixWords).join(' ');
          if (rest) seg.text = rest;
          else if (fallback) seg.text = fallback;
        }
      }
      seg.endMs = Math.max(seg.endMs, rel);
      seg.lastUpdateMs = nowMs;
      return;
    }

    // A late update of a block whose segment was already finalised: keep only the new words.
    let textToAdd = clean;
    let prefix = '';
    const tail = this.tails.get(who);
    if (tail && nowMs - tail.finalizedAtMs <= TAIL_MEMORY_MS) {
      const rest = remainderAfter(tail.text, clean);
      if (rest !== null) {
        if (!rest) return;
        textToAdd = rest;
        prefix = tail.text;
      }
    }
    this.open.push({
      speaker: who,
      text: textToAdd,
      prefix,
      startMs: rel,
      endMs: rel,
      lastUpdateMs: nowMs,
    });
  }

  /** Finalises segments idle for longer than `idleMs` or longer than `maxSegmentMs`. */
  flushIdle(nowMs: number): FinalSegment[] {
    const done: OpenSegment[] = [];
    const keep: OpenSegment[] = [];
    for (const seg of this.open) {
      const idle = nowMs - seg.lastUpdateMs > this.idleMs;
      const tooLong = seg.endMs - seg.startMs >= this.maxSegmentMs;
      (idle || tooLong ? done : keep).push(seg);
    }
    this.open = keep;
    return this.finalize(done, nowMs);
  }

  /** Finalises everything (end of meeting). */
  drain(nowMs = Date.now()): FinalSegment[] {
    const done = this.open;
    this.open = [];
    return this.finalize(done, nowMs);
  }

  private finalize(segments: OpenSegment[], nowMs: number): FinalSegment[] {
    return [...segments]
      .sort((x, y) => x.startMs - y.startMs || x.lastUpdateMs - y.lastUpdateMs)
      .map((seg) => {
        // Remember the full visible block text so late updates of the same block are de-duplicated.
        this.tails.set(seg.speaker, {
          text: visibleText(seg),
          finalizedAtMs: nowMs,
        });
        return {
          seq: this.nextSeq++,
          speaker: seg.speaker,
          text: seg.text,
          startMs: seg.startMs,
          endMs: Math.max(seg.endMs, seg.startMs),
        };
      });
  }
}
