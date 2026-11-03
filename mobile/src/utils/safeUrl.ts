import type { FeatureKey } from '@/api/types';

import { logger } from './logger';

/**
 * Allowlist for every link that comes from content or the network (banners, markdown, notification
 * payloads, OS deep links). Only known internal routes with validated parameters and `https:` URLs pass;
 * any other scheme or malformed input is dropped (and logged at debug level).
 */

export type SafeTarget =
  | { kind: 'internal'; path: string; feature: FeatureKey | null }
  | { kind: 'external'; url: string };

const MAX_LENGTH = 2048;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTTPS_RE = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{2,5})?(\/[^\s<>"'`]*)?$/i;

/** True when the string contains whitespace or ASCII control characters (never valid in a link). */
function hasUnsafeChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) return true;
  }
  return false;
}

/** Web app paths (sidebar/footer hrefs) mapped to their mobile equivalents. */
const WEB_TO_APP: Record<string, string> = {
  '/dashboard': '/home',
  '/analytics/reports': '/meetings',
  '/analytics/overview': '/analytics',
  '/calendar': '/meetings',
  '/action-items': '/reminders?segment=action-items',
  '/settings': '/profile',
};

function parseQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of query.split('&')) {
    if (!part) continue;
    const [rawKey, rawValue = ''] = part.split('=');
    try {
      out[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch {
      // malformed escape: ignore the parameter
    }
  }
  return out;
}

/** Validates a normalised app path against the route allowlist and rebuilds it with only allowed params. */
function allowInternal(pathname: string, query: Record<string, string>): { path: string; feature: FeatureKey | null } | null {
  const segments = pathname.split('/').filter(Boolean);
  const [first, second, ...rest] = segments;
  if (rest.length) return null;

  if (!first || first === 'home') return segments.length <= 1 ? { path: '/home', feature: null } : null;
  if (second === undefined) {
    switch (first) {
      case 'meetings':
        return { path: query.scope === 'past' ? '/meetings?scope=past' : '/meetings', feature: null };
      case 'reminders':
        return {
          path: query.segment === 'action-items' ? '/reminders?segment=action-items' : '/reminders',
          feature: query.segment === 'action-items' ? 'actionItems' : 'reminders',
        };
      case 'ask':
        return {
          path: query.threadId && UUID_RE.test(query.threadId) ? `/ask?threadId=${query.threadId}` : '/ask',
          feature: 'askAi',
        };
      case 'threads':
        return { path: '/threads', feature: 'askAi' };
      case 'notifications':
        return { path: '/notifications', feature: null };
      case 'profile':
        return { path: '/profile', feature: null };
      case 'analytics':
        return { path: '/analytics', feature: 'analytics' };
      default:
        return null;
    }
  }
  if (first === 'meeting' && UUID_RE.test(second)) return { path: `/meeting/${second.toLowerCase()}`, feature: null };
  if ((first === 'page' || first === 'p') && second.length <= 80 && SLUG_RE.test(second)) {
    return { path: `/page/${second}`, feature: null };
  }
  return null;
}

/** Extracts "/path?query" from remi://…, Expo Go exp://…/--/… (dev only) or a plain app path. */
function toPathAndQuery(value: string): string | null {
  if (/^remi:\/\//i.test(value)) return `/${value.replace(/^remi:\/\//i, '').replace(/^\/+/, '')}`;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (__DEV__ && /^exps?:\/\//i.test(value) && value.includes('/--/')) return value.slice(value.indexOf('/--/') + 3);
  return null;
}

export function safeUrl(input: unknown): SafeTarget | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value || value.length > MAX_LENGTH || hasUnsafeChars(value)) {
    logger.debug('Ignored malformed link');
    return null;
  }

  if (/^https:/i.test(value)) {
    if (HTTPS_RE.test(value)) return { kind: 'external', url: value };
    logger.debug('Ignored malformed https link');
    return null;
  }

  const raw = toPathAndQuery(value);
  if (raw === null) {
    logger.debug('Ignored link with a disallowed scheme', { scheme: value.split(':')[0]?.slice(0, 20) });
    return null;
  }
  const [rawPath, rawQuery = ''] = raw.split('?');
  const pathname = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  const mapped = WEB_TO_APP[pathname];
  const [mappedPath, mappedQuery = ''] = (mapped ?? `${pathname}?${rawQuery}`).split('?');
  const allowed = allowInternal(mappedPath, parseQuery(mappedQuery));
  if (!allowed) {
    logger.debug('Ignored link to a route outside the allowlist');
    return null;
  }
  return { kind: 'internal', ...allowed };
}
