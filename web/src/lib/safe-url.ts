/**
 * Allow-list for every link or image URL that comes from config, the CMS, notifications or meeting data.
 * Allowed: same-origin relative paths starting with a single "/", in-page "#anchors", https:, mailto:,
 * and http: in development only. Everything else (javascript:, data:, vbscript:, //evil.com, …) → null.
 */
const isDev = process.env.NODE_ENV !== "production";

export function safeUrl(href: string | null | undefined): string | null {
  if (typeof href !== "string") return null;
  const value = href.trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  if (value.startsWith("/")) return value.startsWith("//") || value.startsWith("/\\") ? null : value;
  if (value.startsWith("#")) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol === "https:" || url.protocol === "mailto:") return url.href;
  if (url.protocol === "http:" && isDev) return url.href;
  return null;
}

/** Image sources: same rules but no mailto: or anchors. */
export function safeImageUrl(src: string | null | undefined): string | null {
  const url = safeUrl(src);
  if (!url || url.startsWith("mailto:") || url.startsWith("#")) return null;
  return url;
}

export const isExternalUrl = (href: string) => /^(https?:|mailto:)/i.test(href);
