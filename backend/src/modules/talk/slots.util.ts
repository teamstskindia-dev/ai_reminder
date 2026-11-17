import { localMinutes } from '../companion/rhythm.util';

export interface Busy {
  start: Date;
  end: Date;
}

const STEP_MS = 15 * 60_000;
/** Proposed meetings stay inside sensible local hours. */
const DAY_START_MIN = 9 * 60;
const DAY_END_MIN = 20 * 60;

/**
 * The first free slot of `durationMs` inside [windowStart, windowEnd] that does not overlap `busy`, starts at
 * least 15 minutes from now on a quarter hour, and stays within 09:00–20:00 local time. Null when none fits.
 */
export function findFreeSlot(opts: {
  busy: Busy[];
  windowStart: Date;
  windowEnd: Date;
  durationMs: number;
  now: Date;
  timezone: string;
}): { start: Date; end: Date } | null {
  const earliest = Math.max(opts.windowStart.getTime(), opts.now.getTime() + 15 * 60_000);
  let t = Math.ceil(earliest / STEP_MS) * STEP_MS;
  const last = opts.windowEnd.getTime() - opts.durationMs;
  for (; t <= last; t += STEP_MS) {
    const start = new Date(t);
    const end = new Date(t + opts.durationMs);
    const startMin = localMinutes(start, opts.timezone);
    const endMin = localMinutes(new Date(end.getTime() - 1), opts.timezone);
    if (startMin < DAY_START_MIN || endMin >= DAY_END_MIN || endMin < startMin) continue;
    const clash = opts.busy.some((b) => start.getTime() < b.end.getTime() && b.start.getTime() < end.getTime());
    if (!clash) return { start, end };
  }
  return null;
}

/** "GMT+05:30" style offset of `date` in `timezone` (for telling the model the local time). */
export function utcOffset(date: Date, timezone: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName');
    return part?.value.replace('GMT', 'UTC') || 'UTC';
  } catch {
    return 'UTC';
  }
}
