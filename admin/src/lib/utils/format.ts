import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = typeof value === 'string' ? parseISO(value) : new Date(value);
  return isValid(date) ? date : null;
}

export function formatDate(value: string | number | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy') : fallback;
}

export function formatDateTime(value: string | number | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy, HH:mm') : fallback;
}

export function formatTime(value: string | number | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  return date ? format(date, 'HH:mm') : fallback;
}

export function formatRelative(value: string | number | Date | null | undefined, fallback = 'never'): string {
  const date = toDate(value);
  return date ? `${formatDistanceToNowStrict(date, { addSuffix: true })}` : fallback;
}

/** "1h 05m", "12m 30s", "45s". */
export function formatDuration(seconds: number | null | undefined, fallback = '—'): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return fallback;
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(rest).padStart(2, '0')}s`;
  return `${rest}s`;
}

/** Milliseconds from start → "mm:ss" or "h:mm:ss". */
export function formatTimestamp(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '--:--';
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatBytes(bytes: number | null | undefined, fallback = '—'): string {
  if (bytes === null || bytes === undefined) return fallback;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

const numberFormatter = new Intl.NumberFormat('en-US');
export function formatNumber(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return numberFormatter.format(value);
}

export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/** "waiting_room" → "Waiting room", "super_admin" → "Super admin", "mobile_tab" → "Mobile tab". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function initials(name: string | null | undefined, fallback = '?'): string {
  if (!name) return fallback;
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase() || fallback;
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Extract unique `{{variable}}` names in order of first appearance. */
export function extractTemplateVariables(...texts: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
      if (match[1]) seen.add(match[1]);
    }
  }
  return [...seen];
}

/** Replace `{{variable}}` with sample values; unknown variables render as `[variable]`. */
export function renderTemplate(text: string | null | undefined, values: Record<string, string>): string {
  if (!text) return '';
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, name: string) => values[name] ?? `[${name}]`);
}

/** ISO string → value for <input type="datetime-local"> in the browser's timezone. */
export function isoToLocalInput(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? format(date, "yyyy-MM-dd'T'HH:mm") : '';
}

/** <input type="datetime-local"> value → ISO string (UTC) or null. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return isValid(date) ? date.toISOString() : null;
}

/** YYYY-MM-DD → ISO at local start/end of day. */
export function dayToIso(day: string | null | undefined, edge: 'start' | 'end'): string | undefined {
  if (!day) return undefined;
  const date = parseISO(day);
  if (!isValid(date)) return undefined;
  if (edge === 'end') date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
