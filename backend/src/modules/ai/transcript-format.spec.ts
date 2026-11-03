import { chunkLines, formatTranscriptLines } from './transcript-format';

describe('formatTranscriptLines', () => {
  it('renders "[mm:ss] Speaker: text" with collapsed whitespace', () => {
    expect(
      formatTranscriptLines([
        { speaker: 'Alice', text: 'Hello   there\n', startMs: 65_000 },
        { speaker: 'Bob', text: ' Hi ', startMs: 0 },
      ]),
    ).toEqual(['[01:05] Alice: Hello there', '[00:00] Bob: Hi']);
  });

  it('keeps counting minutes past one hour', () => {
    expect(formatTranscriptLines([{ speaker: 'A', text: 'late', startMs: 4_503_000 }])).toEqual(['[75:03] A: late']);
  });
});

describe('chunkLines', () => {
  const line = (i: number, len = 30) => `L${String(i).padStart(2, '0')}`.padEnd(len, '.');

  it('returns nothing for no lines', () => {
    expect(chunkLines([])).toEqual([]);
  });

  it('keeps a single short line as one chunk', () => {
    expect(chunkLines(['hello'], 100, 20)).toEqual(['hello']);
  });

  it('respects the size bound for typical lines', () => {
    const lines = Array.from({ length: 40 }, (_, i) => line(i, 25 + (i % 5) * 10));
    const chunks = chunkLines(lines, 200, 40);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
  });

  it('repeats trailing lines of a chunk at the start of the next (overlap)', () => {
    const lines = Array.from({ length: 10 }, (_, i) => line(i));
    const chunks = chunkLines(lines, 100, 20);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1].split('\n');
      const next = chunks[i].split('\n');
      expect(next[0]).toBe(prev[prev.length - 1]);
    }
  });

  it('covers every line at least once, in order', () => {
    const lines = Array.from({ length: 25 }, (_, i) => line(i));
    const seen = chunkLines(lines, 120, 30).flatMap((c) => c.split('\n'));
    const unique = [...new Set(seen)];
    expect(unique).toEqual(lines);
  });

  it('hard-splits a line longer than the chunk size', () => {
    const long = Array.from({ length: 250 }, (_, i) => String.fromCharCode(97 + (i % 26))).join('');
    const chunks = chunkLines([long], 100, 20);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(100);
      expect(long.includes(c)).toBe(true);
    }
    // consecutive pieces overlap by `overlap` characters
    expect(chunks[0] + chunks[1].slice(20) + chunks[2].slice(20)).toBe(long);
  });

  it('uses ~1500/200 defaults', () => {
    const lines = Array.from({ length: 100 }, (_, i) => line(i, 80));
    const chunks = chunkLines(lines);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1500);
    expect(chunks.length).toBeGreaterThanOrEqual(5);
  });
});
