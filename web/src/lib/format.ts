import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isThisYear,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
} from "date-fns";

/** Client-side formatting helpers. Call only from client components (they read the current time). */

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? parseISO(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "h:mm a") : "";
}

export function formatDate(value: string | Date | null | undefined, withYear = false): string {
  const d = toDate(value);
  if (!d) return "";
  return format(d, withYear || !isThisYear(d) ? "MMM d, yyyy" : "EEE, MMM d");
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return `${formatDate(d)} · ${formatTime(d)}`;
}

/** "Today", "Tomorrow", "Yesterday" or "Wed, Nov 5". */
export function formatDayLabel(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, isThisYear(d) ? "EEEE, MMM d" : "EEEE, MMM d, yyyy");
}

/** "Today, 3:30 PM" / "Tomorrow, 9:00 AM" / "Nov 5, 3:30 PM". */
export function formatRelativeDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  if (isToday(d)) return `Today, ${formatTime(d)}`;
  if (isTomorrow(d)) return `Tomorrow, ${formatTime(d)}`;
  if (isYesterday(d)) return `Yesterday, ${formatTime(d)}`;
  return `${format(d, isThisYear(d) ? "MMM d" : "MMM d, yyyy")}, ${formatTime(d)}`;
}

export function timeAgo(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function dayKey(value: string | Date): string {
  const d = toDate(value);
  return d ? format(d, "yyyy-MM-dd") : "";
}

/** True when the timestamp is in the past. */
export function isPastDate(value: string | Date | null | undefined): boolean {
  const d = toDate(value);
  return d ? d.getTime() < Date.now() : false;
}

/** True when the timestamp is at least `marginMs` in the future. */
export function isFutureDate(value: string | Date | null | undefined, marginMs = 0): boolean {
  const d = toDate(value);
  return d ? d.getTime() > Date.now() + marginMs : false;
}

export function daysUntil(value: string | Date | null | undefined): number | null {
  const d = toDate(value);
  return d ? differenceInCalendarDays(d, new Date()) : null;
}

/** 3725 → "1h 2m", 300 → "5m", 45 → "45s". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  return formatDuration(minutes * 60);
}

/** Milliseconds → "mm:ss" or "h:mm:ss" (transcript / chapter timestamps). */
export function formatTimestamp(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function initials(name: string | null | undefined, email?: string | null): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Value for <input type="datetime-local"> from an ISO string (local time). */
export function toLocalInputValue(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : "";
}

/** ISO string (UTC) from an <input type="datetime-local"> value. */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
