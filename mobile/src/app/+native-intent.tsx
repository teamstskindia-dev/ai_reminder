import { logger } from '@/utils/logger';
import { safeUrl } from '@/utils/safeUrl';

const AUTH_CALLBACK_RE = /^(?:remi:\/\/\/?|exps?:\/\/[^/]+\/--\/|\/)auth\/callback\/?(?:\?(.*))?$/i;
const TOKEN_RE = /^[A-Za-z0-9._~-]{1,512}$/;

function sanitizeAuthQuery(query: string | undefined): string {
  const out: string[] = [];
  for (const part of (query ?? '').split('&')) {
    const [key, value = ''] = part.split('=');
    if ((key === 'code' || key === 'error') && TOKEN_RE.test(value)) out.push(`${key}=${value}`);
  }
  return out.length ? `?${out.join('&')}` : '';
}

/**
 * Every URL the OS hands to the app (remi://…, notification intents, Expo Go links) passes through here
 * before routing. Only allowlisted routes survive; anything else lands on the entry route.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // Development-client launcher URLs are handled natively; leave them untouched in dev.
    if (__DEV__ && /^exp\+|expo-development-client/i.test(path)) return path;

    const auth = AUTH_CALLBACK_RE.exec(path);
    if (auth) return `/auth/callback${sanitizeAuthQuery(auth[1])}`;

    const target = safeUrl(path);
    if (target?.kind === 'internal') return target.path;
    if (path && path !== '/' && !/^remi:\/\/\/?$/i.test(path)) logger.debug('Deep link rejected by the allowlist');
    return '/';
  } catch {
    return '/';
  }
}
