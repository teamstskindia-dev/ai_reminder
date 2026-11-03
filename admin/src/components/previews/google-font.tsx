'use client';

import { FONT_FAMILY_RE } from '@/lib/security/safe-url';

/**
 * Loads a Google Font for previews only (the admin's own UI keeps its fixed font). Rendering a <link> in the
 * body is fine in React 19 — it is hoisted into <head>.
 */
export function GoogleFontLink({ family }: { family: string }) {
  const name = family.trim();
  // Only well-formed family names reach the URL (letters, digits, spaces, hyphens; ≤ 64 chars).
  if (!FONT_FAMILY_RE.test(name)) return null;
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`;
  return <link rel="stylesheet" href={href} precedence="default" />;
}
