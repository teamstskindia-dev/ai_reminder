import { findFreeSlot, utcOffset } from './slots.util';

const tz = 'Asia/Kolkata';
// 2026-11-20 (a Friday) 13:00–18:00 IST = 07:30–12:30 UTC.
const windowStart = new Date('2026-11-20T07:30:00Z');
const windowEnd = new Date('2026-11-20T12:30:00Z');
const now = new Date('2026-11-17T06:00:00Z');
const half = 30 * 60_000;

describe('findFreeSlot', () => {
  it('takes the first free quarter hour in the window', () => {
    const slot = findFreeSlot({ busy: [], windowStart, windowEnd, durationMs: half, now, timezone: tz });
    expect(slot?.start.toISOString()).toBe('2026-11-20T07:30:00.000Z');
    expect(slot?.end.toISOString()).toBe('2026-11-20T08:00:00.000Z');
  });

  it('skips busy meetings', () => {
    const busy = [{ start: new Date('2026-11-20T07:30:00Z'), end: new Date('2026-11-20T08:30:00Z') }];
    const slot = findFreeSlot({ busy, windowStart, windowEnd, durationMs: half, now, timezone: tz });
    expect(slot?.start.toISOString()).toBe('2026-11-20T08:30:00.000Z');
  });

  it('never proposes outside 09:00–20:00 local time', () => {
    // 21:00–23:00 IST.
    const slot = findFreeSlot({
      busy: [],
      windowStart: new Date('2026-11-20T15:30:00Z'),
      windowEnd: new Date('2026-11-20T17:30:00Z'),
      durationMs: half,
      now,
      timezone: tz,
    });
    expect(slot).toBeNull();
  });

  it('starts at least 15 minutes from now, on the next quarter hour', () => {
    const soon = new Date('2026-11-20T07:31:00Z'); // +15 min = 07:46 → 08:00
    const slot = findFreeSlot({ busy: [], windowStart, windowEnd, durationMs: half, now: soon, timezone: tz });
    expect(slot?.start.toISOString()).toBe('2026-11-20T08:00:00.000Z');
  });

  it('returns null when everything is busy', () => {
    const busy = [{ start: windowStart, end: windowEnd }];
    expect(findFreeSlot({ busy, windowStart, windowEnd, durationMs: half, now, timezone: tz })).toBeNull();
  });
});

describe('utcOffset', () => {
  it('formats the zone offset', () => {
    expect(utcOffset(new Date('2026-11-20T07:30:00Z'), tz)).toBe('UTC+05:30');
    expect(utcOffset(new Date('2026-11-20T07:30:00Z'), 'Not/AZone')).toBe('UTC');
  });
});
