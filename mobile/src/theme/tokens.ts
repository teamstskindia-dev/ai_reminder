import type { TextStyle } from 'react-native';

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

type TypeStyle = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing'>;

export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.2 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  subheading: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  callout: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.4 },
} as const satisfies Record<string, TypeStyle>;

export type TypographyVariant = keyof typeof typography;

/** Readable content width on tablets (iPad / large Android); phones are narrower than this anyway. */
export const MAX_CONTENT_WIDTH = 760;

/** Minimum touch target on Android (Material guidance). */
export const HIT_TARGET = 48;

export interface Radii {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  pill: number;
}

export function buildRadii(base: number): Radii {
  const r = Number.isFinite(base) ? Math.min(28, Math.max(0, base)) : 10;
  return {
    sm: Math.max(4, Math.round(r * 0.6)),
    md: r,
    lg: Math.round(r * 1.4),
    xl: Math.round(r * 2),
    pill: 999,
  };
}
