export interface ParsedSegment {
  speaker: string;
  text: string;
  startMs: number;
  endMs: number | null;
}

export type TranscriptFormat = 'vtt' | 'srt' | 'txt';

const UNKNOWN = 'Unknown';
const MS_PER_WORD = 400; // ~150 words per minute

/** Parses "hh:mm:ss.mmm", "mm:ss.mmm", "hh:mm:ss,mmm" or "mm:ss" into milliseconds. */
export function parseTimestamp(value: string): number | null {
  const m = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  const min = Number(m[2]);
  const s = Number(m[3]);
  const ms = m[4] ? Number(m[4].padEnd(3, '0')) : 0;
  if (s >= 60) return null;
  return ((h * 60 + min) * 60 + s) * 1000 + ms;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function cleanCueText(text: string): string {
  return text
    .replace(/<\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}>/g, '')
    .replace(/<\/?(?:c|i|b|u|ruby|rt|lang)(?:[.\s][^>]*)?>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Name: text" → speaker + text when the prefix looks like a name. */
export function splitSpeaker(line: string): { speaker: string | null; text: string } {
  const m = /^([^:]{1,40}?):\s+(.+)$/.exec(line);
  if (m && !/[.?!]/.test(m[1]) && !/^\d+$/.test(m[1].trim()) && m[1].trim().split(/\s+/).length <= 4) {
    return { speaker: m[1].trim(), text: m[2].trim() };
  }
  return { speaker: null, text: line.trim() };
}

function extractVoice(text: string): { speaker: string | null; text: string } {
  const m = /<v(?:\.[\w.-]+)?\s+([^>]+)>([\s\S]*?)(?:<\/v>|$)/i.exec(text);
  if (m) return { speaker: m[1].trim(), text: cleanCueText(m[2]) };
  return splitSpeaker(cleanCueText(text));
}

const TIMING = /^\s*(\S+)\s+-->\s+(\S+)/;

function parseCues(blocks: string[]): ParsedSegment[] {
  const out: ParsedSegment[] = [];
  let lastSpeaker: string | null = null;
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.replace(/\r$/, ''));
    const timingIdx = lines.findIndex((l) => TIMING.test(l));
    if (timingIdx < 0) continue;
    const t = TIMING.exec(lines[timingIdx]);
    const start = t ? parseTimestamp(t[1]) : null;
    const end = t ? parseTimestamp(t[2]) : null;
    if (start === null) continue;
    const raw = lines
      .slice(timingIdx + 1)
      .filter((l) => l.trim())
      .join(' ');
    const { speaker, text } = extractVoice(raw);
    if (!text) continue;
    const who = speaker ?? lastSpeaker ?? UNKNOWN;
    lastSpeaker = speaker ?? lastSpeaker;
    out.push({ speaker: who, text, startMs: start, endMs: end });
  }
  return out;
}

export function parseVtt(content: string): ParsedSegment[] {
  const blocks = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .filter((b) => !/^\s*(WEBVTT|NOTE|STYLE|REGION)\b/.test(b));
  return mergeConsecutive(parseCues(blocks));
}

export function parseSrt(content: string): ParsedSegment[] {
  const blocks = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/);
  return mergeConsecutive(parseCues(blocks));
}

/**
 * Plain text: "[mm:ss] Speaker: text", "(hh:mm:ss) Speaker: text", "mm:ss Speaker: text",
 * "Speaker: text" or bare text. Missing timestamps are estimated from word counts.
 */
export function parseTxt(content: string): ParsedSegment[] {
  const out: ParsedSegment[] = [];
  let cursor = 0;
  let lastSpeaker: string | null = null;
  for (const rawLine of content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;
    let start: number | null = null;
    const ts = /^[[(]?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)[\])]?\s*[-–—]?\s*/.exec(line);
    if (ts) {
      start = parseTimestamp(ts[1]);
      if (start !== null) line = line.slice(ts[0].length);
    }
    const { speaker, text } = splitSpeaker(line);
    if (!text) continue;
    const who = speaker ?? lastSpeaker ?? UNKNOWN;
    lastSpeaker = speaker ?? lastSpeaker;
    const startMs = start ?? cursor;
    out.push({ speaker: who, text, startMs, endMs: null });
    cursor = startMs + wordCount(text) * MS_PER_WORD;
  }
  // Fill end times from the next segment start where available.
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    const estimate = out[i].startMs + wordCount(out[i].text) * MS_PER_WORD;
    out[i].endMs = next && next.startMs > out[i].startMs ? Math.min(next.startMs, estimate) : estimate;
  }
  return out;
}

/** Merges consecutive cues from the same speaker (gap ≤ maxGapMs, merged length ≤ maxDurationMs). */
export function mergeConsecutive(segments: ParsedSegment[], maxGapMs = 2000, maxDurationMs = 30_000): ParsedSegment[] {
  const out: ParsedSegment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    const prevEnd = prev?.endMs ?? prev?.startMs ?? 0;
    if (
      prev &&
      prev.speaker === seg.speaker &&
      seg.startMs - prevEnd <= maxGapMs &&
      (seg.endMs ?? seg.startMs) - prev.startMs <= maxDurationMs
    ) {
      prev.text = `${prev.text} ${seg.text}`.replace(/\s+/g, ' ').trim();
      prev.endMs = seg.endMs ?? prev.endMs;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

export function detectTranscriptFormat(filename: string, content: string): TranscriptFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.vtt') || /^\uFEFF?WEBVTT/.test(content)) return 'vtt';
  if (lower.endsWith('.srt')) return 'srt';
  return 'txt';
}

export function parseTranscript(content: string, format: TranscriptFormat): ParsedSegment[] {
  if (format === 'vtt') return parseVtt(content);
  if (format === 'srt') return parseSrt(content);
  return parseTxt(content);
}
