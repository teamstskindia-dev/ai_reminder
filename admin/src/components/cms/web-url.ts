/** Public website origin used for "View on site" links. */
export const WEB_URL = (process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export function cmsPageUrl(slug: string): string {
  return `${WEB_URL}/p/${encodeURIComponent(slug)}`;
}
