/**
 * Makes user input safe to embed inside PostgREST filter strings (`or=(...)`, `ilike`).
 * Removes characters with syntactic meaning and escapes LIKE wildcards.
 */
export function sanitizeSearch(q: string | undefined | null, maxLength = 100): string | null {
  if (!q) return null;
  const cleaned = q
    .slice(0, maxLength)
    .replace(/[,()*:"\\]/g, ' ')
    .replace(/[%_]/g, (m) => `\\${m}`)
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length ? cleaned : null;
}

/**
 * Escapes `\`, `%` and `_` so a value matches literally inside a SQL `LIKE`/`ILIKE` pattern (Postgres's default
 * escape character is the backslash). Use it for any user- or AI-supplied text placed in a pattern.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Parses `field:asc|desc` against an allowlist. Returns the column (snake_case) and direction. */
export function parseSort(
  sort: string | undefined,
  allowed: Record<string, string>,
  fallback: { column: string; ascending: boolean },
): { column: string; ascending: boolean } {
  if (!sort) return fallback;
  const [field, dir] = sort.split(':');
  const column = allowed[field];
  if (!column) return fallback;
  return { column, ascending: (dir ?? 'asc').toLowerCase() !== 'desc' };
}

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
