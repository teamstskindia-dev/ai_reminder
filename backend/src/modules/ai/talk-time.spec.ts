import { computeTalkStats, countWords, transcriptDurationSeconds } from './talk-time';

describe('countWords', () => {
  it('counts words with letters or digits only', () => {
    expect(countWords('Hello, world — 42 times!')).toBe(4);
    expect(countWords('  -- ... ')).toBe(0);
    expect(countWords('')).toBe(0);
    expect(countWords('नमस्ते दुनिया')).toBe(2);
  });
});

describe('computeTalkStats', () => {
  it('uses endMs - startMs when end times are known', () => {
    const stats = computeTalkStats([
      { speaker: 'Alice', text: 'one two three', startMs: 0, endMs: 10_000 },
      { speaker: 'Bob', text: 'four', startMs: 10_000, endMs: 15_000 },
      { speaker: 'Alice', text: 'five six', startMs: 15_000, endMs: 25_000 },
    ]);
    expect(stats).toEqual([
      { name: 'Alice', talkTimeSeconds: 20, wordCount: 5, talkRatio: 83.33 },
      { name: 'Bob', talkTimeSeconds: 5, wordCount: 1, talkRatio: 16.67 },
    ]);
  });

  it('estimates durations from word count when endMs is null, capped by the next segment start', () => {
    const stats = computeTalkStats([
      // 10 words → 4000 ms estimate, but the next segment starts at 1000 → capped to 1000
      { speaker: 'A', text: 'w w w w w w w w w w', startMs: 0, endMs: null },
      // 5 words → 2000 ms estimate, no next segment
      { speaker: 'B', text: 'x x x x x', startMs: 1000, endMs: null },
    ]);
    const a = stats.find((s) => s.name === 'A')!;
    const b = stats.find((s) => s.name === 'B')!;
    expect(a.talkTimeSeconds).toBe(1);
    expect(b.talkTimeSeconds).toBe(2);
  });

  it('falls back to the estimate when endMs is not after startMs', () => {
    const [s] = computeTalkStats([{ speaker: 'A', text: 'a b c d e', startMs: 5000, endMs: 5000 }]);
    expect(s.talkTimeSeconds).toBe(2);
  });

  it('sorts segments by start time before capping', () => {
    const stats = computeTalkStats([
      { speaker: 'B', text: 'x', startMs: 3000, endMs: null },
      { speaker: 'A', text: 'w w w w w w w w w w', startMs: 0, endMs: null },
    ]);
    expect(stats.find((s) => s.name === 'A')!.talkTimeSeconds).toBe(3);
  });

  it('merges speakers case-insensitively, keeping the first label', () => {
    const stats = computeTalkStats([
      { speaker: 'Priya Sharma', text: 'hello there', startMs: 0, endMs: 2000 },
      { speaker: 'priya sharma ', text: 'again', startMs: 2000, endMs: 3000 },
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toEqual({
      name: 'Priya Sharma',
      talkTimeSeconds: 3,
      wordCount: 3,
      talkRatio: 100,
    });
  });

  it('labels blank speakers as Unknown', () => {
    const [s] = computeTalkStats([{ speaker: '  ', text: 'hi', startMs: 0, endMs: 1000 }]);
    expect(s.name).toBe('Unknown');
  });

  it('talk ratios sum to ~100 with two decimals', () => {
    const stats = computeTalkStats([
      { speaker: 'A', text: 'a', startMs: 0, endMs: 1000 },
      { speaker: 'B', text: 'b', startMs: 1000, endMs: 2000 },
      { speaker: 'C', text: 'c', startMs: 2000, endMs: 3000 },
    ]);
    for (const s of stats) expect(s.talkRatio).toBe(33.33);
    const sum = stats.reduce((acc, s) => acc + s.talkRatio, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.05);
  });

  it('returns an empty list for no segments', () => {
    expect(computeTalkStats([])).toEqual([]);
  });

  it('reports zero ratios when nobody said a word', () => {
    const stats = computeTalkStats([{ speaker: 'A', text: '...', startMs: 0, endMs: 4000 }]);
    expect(stats).toEqual([{ name: 'A', talkTimeSeconds: 4, wordCount: 0, talkRatio: 0 }]);
  });

  it('orders by talk time, then word count', () => {
    const stats = computeTalkStats([
      { speaker: 'Short', text: 'a b c', startMs: 0, endMs: 1000 },
      { speaker: 'Long', text: 'a', startMs: 1000, endMs: 9000 },
      { speaker: 'Same', text: 'a b c d', startMs: 9000, endMs: 10_000 },
    ]);
    expect(stats.map((s) => s.name)).toEqual(['Long', 'Same', 'Short']);
  });
});

describe('transcriptDurationSeconds', () => {
  it('is last end minus first start', () => {
    expect(
      transcriptDurationSeconds([
        { speaker: 'A', text: 'x', startMs: 2000, endMs: 5000 },
        { speaker: 'B', text: 'y', startMs: 60_000, endMs: 62_500 },
      ]),
    ).toBe(61);
  });

  it('estimates the end of segments without endMs', () => {
    expect(transcriptDurationSeconds([{ speaker: 'A', text: 'a b c d e', startMs: 0, endMs: null }])).toBe(2);
  });

  it('is 0 for an empty transcript', () => {
    expect(transcriptDurationSeconds([])).toBe(0);
  });
});
