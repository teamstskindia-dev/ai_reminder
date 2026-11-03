/**
 * Top-level (main-frame) navigation allowlist for the bot's browser. Google Meet may bounce through
 * accounts.google.com or other *.google.com pages; anything else (phishing redirects, file/data URLs,
 * plain http) is aborted. Subresources and iframes are not restricted by this check.
 */
const ALLOWED_HOST_SUFFIXES = ['.google.com', '.gstatic.com'];
const ALLOWED_HOSTS = new Set(['google.com', 'meet.google.com', 'accounts.google.com']);

export function isAllowedNavigation(url: string): boolean {
  if (url === 'about:blank') return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== '443') return false;
  const host = parsed.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}

/** True when the page ended up on Google Meet itself (not a sign-in or error page). */
export function isMeetPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'meet.google.com';
  } catch {
    return false;
  }
}
