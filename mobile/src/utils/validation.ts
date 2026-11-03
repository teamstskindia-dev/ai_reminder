const MEET_RE = /^https:\/\/meet\.google\.com\/[a-z0-9-]{3,}(\?.*)?$/i;

/** Accepts "meet.google.com/abc-defg-hij" too, normalising to https. */
export function normalizeMeetUrl(input: string): string {
  const value = input.trim();
  if (!value) return value;
  if (/^meet\.google\.com\//i.test(value)) return `https://${value}`;
  if (/^http:\/\/meet\.google\.com\//i.test(value)) return value.replace(/^http:/i, 'https:');
  return value;
}

export function isMeetUrl(value: string): boolean {
  return MEET_RE.test(value);
}
