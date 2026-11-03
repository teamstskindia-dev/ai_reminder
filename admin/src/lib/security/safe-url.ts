/**
 * URL allow-listing for everything rendered from data (API content, admin input, audit values).
 *
 * Allowed:
 * - root-relative paths `/path` (not protocol-relative `//host` or `/\host`)
 * - `https:` everywhere, `http:` only in development
 * - `mailto:` for links
 * - `remi://` deep links — valid content for the app, but display-only here (never an <a href>)
 * Blocked: `javascript:`, `data:`, `vbscript:`, `file:`, anything else, and any value with whitespace or control
 * characters (used to smuggle schemes past naive checks).
 */

const isProduction = process.env.NODE_ENV === 'production';
export const URL_MAX_LENGTH = 2048;

const CONTROL_OR_SPACE = /[\x00-\x20\x7F-\x9F\u2028\u2029]/;
const APP_SCHEME = 'remi:';

export type UrlKind = 'link' | 'image';

export type UrlCheck =
  | { ok: true; kind: 'relative' | 'web' | 'mailto' | 'app'; value: string }
  | { ok: false; reason: string };

/** Classify a URL against the allow-list. `image` accepts only relative and web URLs. */
export function checkUrl(raw: string | null | undefined, kind: UrlKind = 'link'): UrlCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'Missing URL' };
  const value = raw.trim();
  if (!value) return { ok: false, reason: 'Missing URL' };
  if (value.length > URL_MAX_LENGTH) return { ok: false, reason: `URLs must be under ${URL_MAX_LENGTH} characters` };
  if (CONTROL_OR_SPACE.test(value)) return { ok: false, reason: 'URLs cannot contain spaces or control characters' };

  if (value.startsWith('/')) {
    if (value.startsWith('//') || value.startsWith('/\\')) {
      return { ok: false, reason: 'Protocol-relative URLs (//host) are not allowed' };
    }
    return { ok: true, kind: 'relative', value };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'Use https://…, a path starting with /, or another allowed link' };
  }
  const protocol = url.protocol.toLowerCase();
  if (protocol === 'https:') return { ok: true, kind: 'web', value };
  if (protocol === 'http:') {
    return isProduction
      ? { ok: false, reason: 'Use https:// (http:// is only allowed in development)' }
      : { ok: true, kind: 'web', value };
  }
  if (kind === 'link' && protocol === 'mailto:') return { ok: true, kind: 'mailto', value };
  if (kind === 'link' && protocol === APP_SCHEME) return { ok: true, kind: 'app', value };
  return {
    ok: false,
    reason:
      kind === 'image'
        ? 'Images must use https:// or a path starting with /'
        : 'Only https://, /paths, mailto: and remi:// links are allowed',
  };
}

/** Value safe for `<a href>`; `null` for anything blocked or display-only (remi://). */
export function safeHref(raw: string | null | undefined): string | null {
  const check = checkUrl(raw, 'link');
  if (!check.ok || check.kind === 'app') return null;
  return check.value;
}

/** Value safe for `<img src>` (https, dev-only http, or root-relative). */
export function safeImageSrc(raw: string | null | undefined): string | null {
  const check = checkUrl(raw, 'image');
  return check.ok ? check.value : null;
}

/** True for absolute web URLs that should open in a new tab with `rel="noopener noreferrer"`. */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.toLowerCase().startsWith('mailto:');
}

/** `href` + safe new-tab attributes, or null when the URL is not allowed. */
export function safeLinkProps(
  raw: string | null | undefined,
): { href: string; target?: '_blank'; rel?: 'noopener noreferrer' } | null {
  const href = safeHref(raw);
  if (!href) return null;
  return isExternalHref(href) ? { href, target: '_blank', rel: 'noopener noreferrer' } : { href };
}

/** Strict `#RRGGBB`. */
export const HEX6_RE = /^#[0-9a-fA-F]{6}$/;
/** Google font family names: letters, digits, spaces and hyphens. */
export const FONT_FAMILY_RE = /^[A-Za-z0-9 -]{1,64}$/;

/** The colour if it is a valid `#RRGGBB`, otherwise the fallback. Use before putting colours in style objects. */
export function safeColor(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && HEX6_RE.test(value) ? value : fallback;
}

export function safeFontFamily(value: string | null | undefined, fallback = 'Inter'): string {
  return typeof value === 'string' && FONT_FAMILY_RE.test(value.trim()) ? value.trim() : fallback;
}

/** Post-login redirect target: a same-origin path only (`^/(?!/)`, no backslash tricks), else `/`. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !/^\/(?![/\\])/.test(value) || CONTROL_OR_SPACE.test(value)) return '/';
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) return '/';
  return value;
}
