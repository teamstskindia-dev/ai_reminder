export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX_RE = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value.trim());
}

export function parseHex(hex: string, fallback = '#000000'): Rgb {
  const source = isHexColor(hex) ? hex.trim() : fallback;
  let h = source.replace('#', '');
  if (h.length === 3 || h.length === 4) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function channel(n: number): string {
  return Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0');
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/** Mixes `b` into `a` by `weight` (0 = a, 1 = b). */
export function mix(a: string, b: string, weight: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const w = Math.min(1, Math.max(0, weight));
  return toHex({
    r: ca.r + (cb.r - ca.r) * w,
    g: ca.g + (cb.g - ca.g) * w,
    b: ca.b + (cb.b - ca.b) * w,
    a: 1,
  });
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}

function linear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Moves `color` toward white/black until it reaches `minContrast` against `background`. */
export function ensureContrast(color: string, background: string, minContrast: number): string {
  if (contrastRatio(color, background) >= minContrast) return color;
  const target = luminance(background) > 0.5 ? '#000000' : '#FFFFFF';
  for (let w = 0.1; w <= 1; w += 0.1) {
    const candidate = mix(color, target, w);
    if (contrastRatio(candidate, background) >= minContrast) return candidate;
  }
  return target;
}

/** Black or white, whichever reads better on `background`. */
export function readableOn(background: string): string {
  return contrastRatio('#FFFFFF', background) >= contrastRatio('#111111', background) ? '#FFFFFF' : '#111111';
}
