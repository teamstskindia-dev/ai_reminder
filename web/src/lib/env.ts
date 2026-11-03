/**
 * Client-safe environment values. Only `NEXT_PUBLIC_*` variables may be read here — server-only
 * values (API_URL_INTERNAL, REVALIDATE_SECRET) live in `env.server.ts`.
 */
export const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** Public API origin (browser + server). Clients append `/api/v1` themselves. */
export const PUBLIC_API_URL = trimSlash(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000");

/** Base URL for browser-side API calls. */
export const API_BASE_URL = `${PUBLIC_API_URL}/api/v1`;

/** Public site origin, used for metadata (canonical / OG URLs). */
export const SITE_URL = trimSlash(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");

/** Cookie names set by the API (see API contract §0 Authentication). */
export const ACCESS_COOKIE = "remi_at";
export const REFRESH_COOKIE = "remi_rt";
/** Short-lived cookie that carries `next` through the Google OAuth round-trip. */
export const NEXT_COOKIE = "remi_next";
