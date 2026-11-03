export interface ZonedParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number; // 0..23
  minute: number;
  second: number;
}

export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimeZone(timeZone),
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Offset (ms) of `timeZone` relative to UTC at the given instant. */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/** UTC instant of local midnight (in `timeZone`) of the day containing `date`, shifted by `addDays`. */
export function startOfLocalDay(date: Date, timeZone: string, addDays = 0): Date {
  const p = zonedParts(date, timeZone);
  const guess = Date.UTC(p.year, p.month - 1, p.day + addDays, 0, 0, 0);
  const offset = tzOffsetMs(new Date(guess), timeZone);
  const result = new Date(guess - offset);
  const offset2 = tzOffsetMs(result, timeZone);
  return offset2 === offset ? result : new Date(guess - offset2);
}

/** YYYY-MM-DD in the given time zone. */
export function localDateString(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Parses YYYY-MM-DD as local midnight in `timeZone`. */
export function parseLocalDate(value: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const offset = tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

export function formatDateTime(date: Date, timeZone: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: safeTimeZone(timeZone),
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatTime(date: Date, timeZone: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { timeZone: safeTimeZone(timeZone), timeStyle: 'short' }).format(date);
}

export function formatLongDate(date: Date, timeZone: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: safeTimeZone(timeZone),
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/** "[mm:ss]" style clock; minutes keep counting past 59 (e.g. 75:03). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Human relative due phrase: "today at 5:00 PM", "tomorrow at 9:00 AM", "on Mon, Nov 10", "2 days ago". */
export function relativeDue(due: Date, now: Date, timeZone: string): string {
  const dayDiff = Math.round(
    (startOfLocalDay(due, timeZone).getTime() - startOfLocalDay(now, timeZone).getTime()) / 86_400_000,
  );
  const time = formatTime(due, timeZone);
  if (dayDiff === 0) return `today at ${time}`;
  if (dayDiff === 1) return `tomorrow at ${time}`;
  if (dayDiff === -1) return 'yesterday';
  if (dayDiff < -1) return `${-dayDiff} days ago`;
  if (dayDiff < 7) {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: safeTimeZone(timeZone), weekday: 'long' }).format(due);
    return `on ${weekday} at ${time}`;
  }
  return `on ${new Intl.DateTimeFormat('en-US', { timeZone: safeTimeZone(timeZone), month: 'short', day: 'numeric' }).format(due)}`;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function isoOrNull(value: string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function iso(value: string | Date): string {
  return new Date(value).toISOString();
}
