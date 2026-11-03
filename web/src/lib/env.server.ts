import "server-only";
import { PUBLIC_API_URL, trimSlash } from "./env";

/** Base URL for server-side fetches (may point at an internal hostname). */
export function serverApiBaseUrl(): string {
  return `${trimSlash(process.env.API_URL_INTERNAL || PUBLIC_API_URL)}/api/v1`;
}

/** Shared secret for the on-demand revalidation webhook. */
export function revalidateSecret(): string | undefined {
  const value = process.env.REVALIDATE_SECRET;
  return value && value.length >= 8 ? value : undefined;
}
