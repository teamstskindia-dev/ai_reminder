/** "a|b|c" (admin-configured texts) → case-insensitive regex source with each alternative escaped. */
export function textPattern(value: string | undefined): string | null {
  const parts = (value ?? '')
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/[.*+?^${}()[\]\\]/g, '\\$&'));
  return parts.length ? parts.join('|') : null;
}
