import {
  addMinutes,
  formatClock,
  localDateString,
  parseLocalDate,
  relativeDue,
  safeTimeZone,
  startOfLocalDay,
  tzOffsetMs,
  zonedParts,
} from './time.util';

const norm = (s: string) => s.replace(/\s+/g, ' ');

describe('safeTimeZone', () => {
  it('keeps valid zones and falls back to UTC', () => {
    expect(safeTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata');
    expect(safeTimeZone('Not/AZone')).toBe('UTC');
    expect(safeTimeZone('')).toBe('UTC');
    expect(safeTimeZone(null)).toBe('UTC');
    expect(safeTimeZone(undefined)).toBe('UTC');
  });
});

describe('zonedParts', () => {
  it('converts to Asia/Kolkata (+05:30)', () => {
    expect(zonedParts(new Date('2026-11-03T20:00:00Z'), 'Asia/Kolkata')).toEqual({
      year: 2026,
      month: 11,
      day: 4,
      hour: 1,
      minute: 30,
      second: 0,
    });
  });

  it('reports midnight as hour 0 (not 24)', () => {
    expect(zonedParts(new Date('2026-11-03T18:30:00Z'), 'Asia/Kolkata').hour).toBe(0);
  });

  it('handles America/New_York before and after the DST change', () => {
    expect(zonedParts(new Date('2026-10-31T16:00:00Z'), 'America/New_York').hour).toBe(12); // EDT -4
    expect(zonedParts(new Date('2026-11-02T17:00:00Z'), 'America/New_York').hour).toBe(12); // EST -5
  });

  it('falls back to UTC for an invalid zone', () => {
    expect(zonedParts(new Date('2026-11-03T20:15:00Z'), 'Bogus/Zone')).toMatchObject({ day: 3, hour: 20, minute: 15 });
  });
});

describe('tzOffsetMs', () => {
  it('returns the zone offset at an instant', () => {
    expect(tzOffsetMs(new Date('2026-11-03T12:00:00Z'), 'Asia/Kolkata')).toBe(330 * 60_000);
    expect(tzOffsetMs(new Date('2026-07-01T12:00:00Z'), 'America/New_York')).toBe(-4 * 3600_000);
    expect(tzOffsetMs(new Date('2026-12-01T12:00:00Z'), 'America/New_York')).toBe(-5 * 3600_000);
    expect(tzOffsetMs(new Date('2026-12-01T12:00:00.789Z'), 'UTC')).toBe(0);
  });
});

describe('startOfLocalDay', () => {
  it('Asia/Kolkata local midnight', () => {
    const now = new Date('2026-11-03T20:00:00Z'); // Nov 4, 01:30 IST
    expect(startOfLocalDay(now, 'Asia/Kolkata').toISOString()).toBe('2026-11-03T18:30:00.000Z');
    expect(startOfLocalDay(now, 'Asia/Kolkata', -1).toISOString()).toBe('2026-11-02T18:30:00.000Z');
    expect(startOfLocalDay(now, 'Asia/Kolkata', 1).toISOString()).toBe('2026-11-04T18:30:00.000Z');
  });

  it('America/New_York across the November 2026 fall-back (Nov 1)', () => {
    // Midnight Nov 1 is still EDT (-4); midnight Nov 2 is EST (-5).
    expect(startOfLocalDay(new Date('2026-11-01T12:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
    expect(startOfLocalDay(new Date('2026-11-02T12:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    );
    expect(startOfLocalDay(new Date('2026-11-01T12:00:00Z'), 'America/New_York', 1).toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    );
  });

  it('America/New_York across the March 2026 spring-forward (Mar 8)', () => {
    expect(startOfLocalDay(new Date('2026-03-08T18:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    expect(startOfLocalDay(new Date('2026-03-09T18:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
  });

  it('UTC', () => {
    expect(startOfLocalDay(new Date('2026-11-03T23:59:59Z'), 'UTC').toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });
});

describe('localDateString', () => {
  it('formats the local calendar date', () => {
    const d = new Date('2026-11-03T20:00:00Z');
    expect(localDateString(d, 'Asia/Kolkata')).toBe('2026-11-04');
    expect(localDateString(d, 'America/New_York')).toBe('2026-11-03');
    expect(localDateString(new Date('2026-01-05T00:00:00Z'), 'UTC')).toBe('2026-01-05');
  });
});

describe('parseLocalDate', () => {
  it('parses YYYY-MM-DD as local midnight', () => {
    expect(parseLocalDate('2026-11-04', 'Asia/Kolkata')?.toISOString()).toBe('2026-11-03T18:30:00.000Z');
    expect(parseLocalDate('2026-11-01', 'America/New_York')?.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(parseLocalDate('2026-11-02', 'America/New_York')?.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(parseLocalDate('2026-03-08', 'America/New_York')?.toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });

  it('agrees with startOfLocalDay', () => {
    for (const tz of ['Asia/Kolkata', 'America/New_York', 'Europe/Berlin', 'UTC']) {
      const d = new Date('2026-06-15T15:00:00Z');
      expect(parseLocalDate(localDateString(d, tz), tz)?.getTime()).toBe(startOfLocalDay(d, tz).getTime());
    }
  });

  it('rejects malformed input', () => {
    expect(parseLocalDate('2026-3-8', 'UTC')).toBeNull();
    expect(parseLocalDate('abc', 'UTC')).toBeNull();
    expect(parseLocalDate('2026-11-03T00:00:00Z', 'UTC')).toBeNull();
  });
});

describe('formatClock', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [59_999, '00:59'],
    [65_000, '01:05'],
    [3_600_000, '60:00'],
    [4_503_000, '75:03'],
    [-5, '00:00'],
  ])('%d ms → %s', (ms, out) => {
    expect(formatClock(ms)).toBe(out);
  });
});

describe('relativeDue', () => {
  const tz = 'Asia/Kolkata';
  const now = new Date('2026-11-03T04:30:00Z'); // Tue Nov 3, 10:00 IST

  it('today', () => {
    expect(norm(relativeDue(new Date('2026-11-03T11:30:00Z'), now, tz))).toBe('today at 5:00 PM');
  });

  it('tomorrow', () => {
    expect(norm(relativeDue(new Date('2026-11-04T03:30:00Z'), now, tz))).toBe('tomorrow at 9:00 AM');
  });

  it('yesterday', () => {
    expect(relativeDue(new Date('2026-11-02T10:00:00Z'), now, tz)).toBe('yesterday');
  });

  it('days ago', () => {
    expect(relativeDue(new Date('2026-10-31T10:00:00Z'), now, tz)).toBe('3 days ago');
  });

  it('later this week uses the weekday', () => {
    expect(norm(relativeDue(new Date('2026-11-06T06:30:00Z'), now, tz))).toBe('on Friday at 12:00 PM');
  });

  it('further out uses month and day', () => {
    expect(relativeDue(new Date('2026-11-13T06:30:00Z'), now, tz)).toBe('on Nov 13');
  });

  it('uses the local day boundary, not UTC', () => {
    // 2026-11-03T19:00Z is already Nov 4 00:30 in IST → tomorrow.
    expect(relativeDue(new Date('2026-11-03T19:00:00Z'), now, tz).startsWith('tomorrow')).toBe(true);
  });
});

describe('addMinutes', () => {
  it('adds (and subtracts) minutes', () => {
    const d = new Date('2026-11-03T10:00:00Z');
    expect(addMinutes(d, 15).toISOString()).toBe('2026-11-03T10:15:00.000Z');
    expect(addMinutes(d, -60).toISOString()).toBe('2026-11-03T09:00:00.000Z');
  });
});
