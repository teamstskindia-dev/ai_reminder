export const DEFAULT_AFTER_LOGIN = "/dashboard";

/**
 * Post-login destinations must be same-origin relative paths: `^/(?!/)`, no backslashes or control
 * characters, and never `/auth/*` or `/login` (prevents open redirects and loops). Returns `null` if unsafe.
 */
export function sanitizeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!/^\/(?!\/)/.test(decoded)) return null;
  if (decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) return null;
  if (decoded === "/login" || decoded.startsWith("/login?") || decoded.startsWith("/auth/") || decoded === "/auth") return null;
  return decoded;
}

/** `sanitizeNext` with the default destination applied. */
export function safeNext(value: string | null | undefined): string {
  return sanitizeNext(value) ?? DEFAULT_AFTER_LOGIN;
}
