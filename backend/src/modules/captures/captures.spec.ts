import { captureFoundText } from '../ai/ai-pipeline.service';
import { mergePartSegments, toRecordingParts } from '../ai/transcription.service';
import { toBookmarks, toCaptureStatus } from './captures.mapper';
import { defaultCaptureTitle } from './captures.util';

describe('mergePartSegments', () => {
  it('shifts each part by the length of the parts before it and renumbers seq', () => {
    const merged = mergePartSegments([
      {
        durationMs: 300_000,
        segments: [
          { seq: 0, speaker: 'Speaker 1', text: 'Hi', startMs: 0, endMs: 1000 },
          { seq: 1, speaker: 'Speaker 2', text: 'Hello', startMs: 2000, endMs: null },
        ],
      },
      {
        durationMs: 120_000,
        segments: [{ seq: 0, speaker: 'Speaker 1', text: 'Next part', startMs: 500, endMs: 900 }],
      },
      { durationMs: 0, segments: [{ seq: 0, speaker: 'Speaker 2', text: 'Last', startMs: 100, endMs: 200 }] },
    ]);
    expect(merged.map((s) => [s.seq, s.startMs, s.endMs])).toEqual([
      [0, 0, 1000],
      [1, 2000, null],
      [2, 300_500, 300_900],
      [3, 420_100, 420_200],
    ]);
  });

  it('falls back to the last segment end when a part has no duration', () => {
    const merged = mergePartSegments([
      { durationMs: 0, segments: [{ seq: 0, speaker: 'A', text: 'x', startMs: 0, endMs: 4000 }] },
      { durationMs: 0, segments: [{ seq: 0, speaker: 'A', text: 'y', startMs: 0, endMs: 10 }] },
    ]);
    expect(merged[1].startMs).toBe(4000);
  });
});

describe('toRecordingParts', () => {
  it('keeps valid parts in index order and ignores junk', () => {
    expect(
      toRecordingParts([
        { index: 1, path: 'u/m/part-001.m4a', durationMs: 5 },
        { index: 0, path: 'u/m/part-000.m4a', durationMs: 300000.4 },
        { index: 'x', path: 'bad' },
        null,
      ]),
    ).toEqual([
      { index: 0, path: 'u/m/part-000.m4a', durationMs: 300000, bytes: undefined },
      { index: 1, path: 'u/m/part-001.m4a', durationMs: 5, bytes: undefined },
    ]);
    expect(toRecordingParts('nope')).toEqual([]);
  });
});

describe('captureFoundText', () => {
  it('describes what was found', () => {
    expect(captureFoundText(3, 1, 0)).toBe('3 to-dos, 1 reminder found');
    expect(captureFoundText(1, 0, 2)).toBe('1 to-do found, 2 things to confirm');
    expect(captureFoundText(0, 0, 1)).toBe('1 thing to confirm');
    expect(captureFoundText(0, 0, 0)).toBe('Summary ready');
  });
});

describe('capture mapping helpers', () => {
  it('maps meeting statuses to capture statuses', () => {
    expect(toCaptureStatus('uploading')).toBe('uploading');
    expect(toCaptureStatus('processing')).toBe('processing');
    expect(toCaptureStatus('completed')).toBe('completed');
    expect(toCaptureStatus('cancelled')).toBe('failed');
  });

  it('reads bookmarks defensively and sorts them', () => {
    expect(toBookmarks([{ atMs: 9000, label: '' }, { atMs: 1000, label: 'Pricing' }, { label: 'no time' }])).toEqual([
      { atMs: 1000, label: 'Pricing' },
      { atMs: 9000, label: null },
    ]);
  });

  it('builds a default title in the user time zone', () => {
    const title = defaultCaptureTitle(new Date('2026-11-16T08:35:00Z'), 'Asia/Kolkata');
    expect(title).toMatch(/^Conversation · 16 Nov/);
    expect(title).toMatch(/2:05/);
    expect(defaultCaptureTitle(new Date('2026-11-16T08:35:00Z'), 'Not/AZone')).toMatch(/^Conversation · 2026-11-16/);
  });
});
