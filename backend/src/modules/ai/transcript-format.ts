import { formatClock } from '../../common/utils/time.util';

export interface LineSegment {
  speaker: string;
  text: string;
  startMs: number;
}

/** "[mm:ss] Speaker: text" lines, the transcript format the meeting_report prompt expects. */
export function formatTranscriptLines(segments: LineSegment[]): string[] {
  return segments.map((s) => `[${formatClock(s.startMs)}] ${s.speaker}: ${s.text.replace(/\s+/g, ' ').trim()}`);
}

/**
 * Packs lines into chunks of at most `size` characters, repeating the trailing ~`overlap`
 * characters (whole lines) at the start of the next chunk. Lines longer than `size` are hard-split.
 */
export function chunkLines(lines: string[], size = 1500, overlap = 200): string[] {
  const step = Math.max(1, size - overlap);
  const pieces: string[] = [];
  for (const line of lines) {
    if (line.length <= size) {
      pieces.push(line);
      continue;
    }
    for (let i = 0; i < line.length; i += step) {
      pieces.push(line.slice(i, i + size));
      if (i + size >= line.length) break;
    }
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0; // characters including one "\n" per line
  for (const piece of pieces) {
    if (current.length && length + piece.length > size) {
      chunks.push(current.join('\n'));
      const carry: string[] = [];
      let carried = 0;
      for (let i = current.length - 1; i >= 0 && carried < overlap; i--) {
        if (carried + current[i].length + 1 > overlap * 2) break;
        carry.unshift(current[i]);
        carried += current[i].length + 1;
      }
      // Only keep the overlap if the next piece still fits.
      if (carried + piece.length > size) {
        current = [];
        length = 0;
      } else {
        current = carry;
        length = carried;
      }
    }
    current.push(piece);
    length += piece.length + 1;
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}
