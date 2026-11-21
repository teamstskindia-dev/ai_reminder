import { moodStats, weekdayOf } from './mood-insights.util';

function days(start: string, moods: (number | null)[]) {
  const base = new Date(`${start}T12:00:00Z`).getTime();
  return moods.map((mood, i) => ({
    date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    mood,
    energy: mood === null ? null : Math.max(1, mood - 1),
  }));
}

describe('mood insights', () => {
  it('knows the weekday of a local date', () => {
    expect(weekdayOf('2026-11-22')).toBe(0); // Sunday
    expect(weekdayOf('2026-11-21')).toBe(6);
  });

  it('returns nulls without check-ins', () => {
    const s = moodStats(days('2026-11-01', [null, null, null]));
    expect(s.averageMood).toBeNull();
    expect(s.trend).toBeNull();
    expect(s.bestDay).toBeNull();
    expect(s.checkins).toBe(0);
  });

  it('computes averages, an upward trend and the best and hardest weekday', () => {
    // 2026-11-02 is a Monday: Mondays are low, the last week is better than the one before.
    const s = moodStats(days('2026-11-02', [1, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 2, 5, 5, 5, 5, 5, 5]));
    expect(s.trend).toBe('up');
    expect(s.hardestDay).toBe(1);
    expect(s.bestDay).not.toBe(1);
    expect(s.averageMood).toBeGreaterThan(3);
    expect(s.checkins).toBe(21);
  });

  it('says flat when the weeks are similar and skips best/worst without a real difference', () => {
    const s = moodStats(
      days(
        '2026-11-02',
        Array.from({ length: 14 }, () => 3),
      ),
    );
    expect(s.trend).toBe('flat');
    expect(s.bestDay).toBeNull();
    expect(s.hardestDay).toBeNull();
  });
});
