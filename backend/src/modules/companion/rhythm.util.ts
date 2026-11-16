import { localDateString, safeTimeZone, startOfLocalDay, zonedParts } from '../../common/utils/time.util';

/** Local times are stored as "HH:MM" (24h) in the user's time zone. */
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MINUTES = 24 * 60;

/** Minutes since local midnight for "HH:MM", or null when malformed. */
export function toMinutes(hhmm: string | null | undefined): number | null {
  const m = HHMM_RE.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Current minutes since local midnight in `timeZone`. */
export function localMinutes(now: Date, timeZone: string): number {
  const p = zonedParts(now, timeZone);
  return p.hour * 60 + p.minute;
}

/** Minutes elapsed since `targetMin` today, wrapping at midnight (0..1439). */
export function minutesSince(nowMin: number, targetMin: number): number {
  return (((nowMin - targetMin) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

/**
 * True when `target` passed less than `windowMin` minutes ago. The tick runs every 5 minutes and the
 * window is wider so one missed tick does not drop a morning brief; idempotency keys stop duplicates.
 */
export function isDue(nowMin: number, target: string, windowMin = 15): boolean {
  const t = toMinutes(target);
  return t !== null && minutesSince(nowMin, t) < windowMin;
}

/** Quiet hours may wrap midnight (22:30 → 07:00). Equal start and end means no quiet hours. */
export function inQuietHours(nowMin: number, start: string, end: string): boolean {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null || s === e) return false;
  return s < e ? nowMin >= s && nowMin < e : nowMin >= s || nowMin < e;
}

/** YYYY-MM-DD of `date` in `timeZone`, shifted by `addDays`. */
export function dayKey(date: Date, timeZone: string, addDays = 0): string {
  return addDays
    ? localDateString(startOfLocalDay(date, timeZone, addDays), timeZone)
    : localDateString(date, timeZone);
}

/**
 * The local day a just-due target belongs to: a 23:55 check-in seen by the 00:05 tick still belongs to
 * yesterday.
 */
export function dueDay(now: Date, timeZone: string, target: string): string {
  const t = toMinutes(target) ?? 0;
  return localMinutes(now, timeZone) >= t ? dayKey(now, timeZone) : dayKey(now, timeZone, -1);
}

/** A `@db.Date` value for a YYYY-MM-DD local day (stored as UTC midnight). */
export function dateOnly(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** YYYY-MM-DD of a `@db.Date` value. */
export function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** UTC instant of "HH:MM" on the local day `day` (YYYY-MM-DD) in `timeZone`. */
export function atLocalTime(day: string, timeZone: string, hhmm: string): Date {
  const minutes = toMinutes(hhmm) ?? 0;
  const midnight = startOfLocalDay(new Date(`${day}T12:00:00.000Z`), timeZone);
  const guess = new Date(midnight.getTime() + minutes * 60_000);
  // Correct for a DST change between midnight and the target time.
  const drift = localMinutes(guess, timeZone) - minutes;
  return drift ? new Date(guess.getTime() - drift * 60_000) : guess;
}

/** "Mon".."Sun" in `timeZone`. */
export function weekday(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: safeTimeZone(timeZone), weekday: 'short' }).format(date);
}

/** Monday (YYYY-MM-DD) of the local week containing `day`. */
export function weekStartOf(day: string): string {
  const d = dateOnly(day);
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  return dayString(new Date(d.getTime() - offset * 86_400_000));
}

export function addDays(day: string, n: number): string {
  return dayString(new Date(dateOnly(day).getTime() + n * 86_400_000));
}

// ---------- relationship warmth ----------
export type CheckinOutcome = 'completed' | 'replied' | 'missed' | 'none';

/** Warmth grows with real conversations and dips a little when check-ins are skipped. */
export function nextWarmth(current: number, outcome: CheckinOutcome, activeYesterday: boolean): number {
  const delta = { completed: 4, replied: 2, missed: -1, none: 0 }[outcome] + (activeYesterday ? 1 : 0);
  return Math.max(0, Math.min(100, current + delta));
}

/** 1 polite and curious (0–29), 2 casual (30–69), 3 close friend (70+). */
export function stageFor(warmth: number): 1 | 2 | 3 {
  return warmth >= 70 ? 3 : warmth >= 30 ? 2 : 1;
}
