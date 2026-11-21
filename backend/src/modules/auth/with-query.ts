/** Adds query parameters to a redirect target (an app deep link or a web URL). */
export function withQuery(target: string, params: Record<string, string>): string {
  try {
    const url = new URL(target);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
  } catch {
    const qs = new URLSearchParams(params).toString();
    return `${target}${target.includes('?') ? '&' : '?'}${qs}`;
  }
}
