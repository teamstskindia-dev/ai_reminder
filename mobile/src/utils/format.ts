import {
  addDays,
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isSameYear,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
  startOfDay,
} from 'date-fns';

export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : parseISO(value);
}

export function isValidDate(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  return !Number.isNaN(toDate(value).getTime());
}

/** "9:30 AM" */
export function formatTime(value: string | Date): string {
  return format(toDate(value), 'h:mm a');
}

/** "Today", "Tomorrow", "Yesterday", "Friday", "Mon, Nov 10" or "Nov 10, 2027". */
export function formatDayLabel(value: string | Date, now: Date = new Date()): string {
  const date = toDate(value);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  const diff = differenceInCalendarDays(date, now);
  if (diff > 1 && diff < 7) return format(date, 'EEEE');
  return isSameYear(date, now) ? format(date, 'EEE, MMM d') : format(date, 'MMM d, yyyy');
}

/** "9:30 – 10:15 AM" style range. */
export function formatTimeRange(start: string, end: string | null): string {
  if (!end || !isValidDate(end)) return formatTime(start);
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** "in 5 min" / "3 hours ago". */
export function formatRelative(value: string | Date): string {
  const date = toDate(value);
  const text = formatDistanceToNowStrict(date, { addSuffix: true });
  return text.replace(' minutes', ' min').replace(' minute', ' min').replace(' seconds', 's').replace(' second', 's');
}

/** 3725 → "1h 2m"; 540 → "9 min". */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** 4200 minutes → "70h"; 95 → "1h 35m". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** 83500 ms → "1:23:20"; 65000 → "1:05". */
export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${suffix}`;
}

export function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function firstName(name: string | null | undefined, email?: string | null): string {
  const n = (name ?? '').trim();
  if (n) return n.split(/\s+/)[0];
  if (email) return email.split('@')[0];
  return '';
}

/** Tomorrow at 09:00 local time. */
export function tomorrowAt(hour: number, now: Date = new Date()): Date {
  const d = startOfDay(addDays(now, 1));
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
