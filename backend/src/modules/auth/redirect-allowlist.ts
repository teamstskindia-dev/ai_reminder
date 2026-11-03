const FORBIDDEN_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:']);

interface ParsedEntry {
  protocol: string;
  host: string;
  path: string;
}

function parseEntry(entry: string): ParsedEntry | null {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)$/i.exec(entry.trim());
  if (!m) return null;
  return { protocol: `${m[1].toLowerCase()}:`, host: m[2].toLowerCase(), path: m[3] };
}

/**
 * Mobile OAuth redirect allowlist (no open redirects). An entry matches on exact scheme, exact host
 * (when the entry names one) and a path prefix on a segment boundary (when the entry has a path).
 * Scheme-only entries (`remi://`, `exp://`) are only honoured for custom app schemes, never http(s).
 */
export function isAllowedRedirect(uri: unknown, allowlist: string[]): boolean {
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > 512) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f<>"'`\\]/.test(uri)) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  const protocol = url.protocol.toLowerCase();
  if (FORBIDDEN_SCHEMES.has(protocol)) return false;
  if (url.username || url.password) return false;
  const host = url.host.toLowerCase();
  const path = url.pathname || '';

  return allowlist.some((raw) => {
    const entry = parseEntry(raw);
    if (!entry || entry.protocol !== protocol) return false;
    const isWeb = protocol === 'http:' || protocol === 'https:';
    if (!entry.host) return !isWeb && entry.path === '';
    if (entry.host !== host) return false;
    if (!entry.path || entry.path === '/') return true;
    const prefix = entry.path.endsWith('/') ? entry.path : `${entry.path}/`;
    return path === entry.path || path.startsWith(prefix);
  });
}
