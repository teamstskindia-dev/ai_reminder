const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'about',
  'from',
  'into',
  'this',
  'that',
  'ko',
  'ka',
  'ki',
  'ke',
  'hai',
  'karna',
  'karo',
  'kar',
  'please',
  'remind',
  'reminder',
  'task',
]);

/** Lower-case words of 3+ letters (digits kept), without common filler. */
export function titleTokens(title: string): string[] {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .match(/[\p{L}\p{N}]{3,}/gu) ?? []
  ).filter((w) => !STOPWORDS.has(w));
}

/** Jaccard similarity of two titles' words (0..1). */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(titleTokens(a));
  const tb = new Set(titleTokens(b));
  if (!ta.size || !tb.size) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Two titles describe the same thing: most words shared, or every word of the shorter one appears in the
 * longer ("Send deck" ~ "Send the pitch deck to Rahul" is NOT the same; "Send pitch deck to Rahul" ~ "Send
 * Rahul the pitch deck" is).
 */
export function sameTitle(a: string, b: string, threshold = 0.6): boolean {
  if (titleSimilarity(a, b) >= threshold) return true;
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  const [short, long] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  return short.length >= 3 && short.every((w) => long.has(w));
}
