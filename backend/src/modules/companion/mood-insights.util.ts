import type { MoodPoint } from '../../common/types/api.types';

export interface MoodStats {
  weekdays: { weekday: number; mood: number | null; energy: number | null }[];
  averageMood: number | null;
  averageEnergy: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  bestDay: number | null;
  hardestDay: number | null;
  checkins: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function average(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => typeof x === 'number');
  return v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

/** 0 Sunday … 6 Saturday for a local date "YYYY-MM-DD". */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/**
 * Mood and energy patterns (user-flow §10) from daily points, oldest first: averages over the last 28 days,
 * per-weekday averages over everything given (8 weeks), the trend of the last 7 days against the 7 before,
 * and the best and hardest weekday once there is a real difference.
 */
export function moodStats(points: MoodPoint[]): MoodStats {
  const recent = points.slice(-28);
  const weekdays = Array.from({ length: 7 }, (_, weekday) => {
    const same = points.filter((p) => weekdayOf(p.date) === weekday);
    return { weekday, mood: average(same.map((p) => p.mood)), energy: average(same.map((p) => p.energy)) };
  });

  const last7 = points.slice(-7).map((p) => p.mood);
  const prev7 = points.slice(-14, -7).map((p) => p.mood);
  const enough = (v: (number | null)[]) => v.filter((x) => x !== null).length >= 2;
  let trend: MoodStats['trend'] = null;
  if (enough(last7) && enough(prev7)) {
    const diff = (average(last7) ?? 0) - (average(prev7) ?? 0);
    trend = diff >= 0.4 ? 'up' : diff <= -0.4 ? 'down' : 'flat';
  }

  const rated = weekdays.filter((w) => w.mood !== null) as { weekday: number; mood: number }[];
  let bestDay: number | null = null;
  let hardestDay: number | null = null;
  if (rated.length >= 2) {
    const best = rated.reduce((a, b) => (b.mood > a.mood ? b : a));
    const worst = rated.reduce((a, b) => (b.mood < a.mood ? b : a));
    if (best.mood - worst.mood >= 0.5) {
      bestDay = best.weekday;
      hardestDay = worst.weekday;
    }
  }

  return {
    weekdays,
    averageMood: average(recent.map((p) => p.mood)),
    averageEnergy: average(recent.map((p) => p.energy)),
    trend,
    bestDay,
    hardestDay,
    checkins: recent.filter((p) => p.mood !== null || p.energy !== null).length,
  };
}
