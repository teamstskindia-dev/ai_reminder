import type { Theme } from '@/api/types';

import { ensureContrast, isHexColor, mix, readableOn, withAlpha } from './color';

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  primary: string;
  primaryForeground: string;
  /** Primary tuned for text/icons on the app background. */
  primaryText: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  accentText: string;

  background: string;
  surface: string;
  surfaceMuted: string;
  surfacePressed: string;
  border: string;
  borderStrong: string;

  text: string;
  textSecondary: string;
  textMuted: string;

  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;

  overlay: string;
  skeleton: string;
  shadow: string;
}

const FALLBACK_PRIMARY = '#5B4FE9';
const FALLBACK_ACCENT = '#22C3A6';

export function buildPalette(theme: Pick<Theme, 'primaryColor' | 'primaryForeground' | 'accentColor'>, scheme: ColorScheme): Palette {
  const primary = isHexColor(theme.primaryColor) ? theme.primaryColor : FALLBACK_PRIMARY;
  const accent = isHexColor(theme.accentColor) ? theme.accentColor : FALLBACK_ACCENT;
  const primaryForeground = isHexColor(theme.primaryForeground) ? theme.primaryForeground : readableOn(primary);
  const dark = scheme === 'dark';

  // Neutrals carry a whisper of the brand hue so the UI feels cohesive with any primary colour.
  const background = dark ? mix('#0E0D14', primary, 0.04) : mix('#F6F6F9', primary, 0.025);
  const surface = dark ? mix('#18171F', primary, 0.05) : '#FFFFFF';
  const surfaceMuted = dark ? mix('#211F2B', primary, 0.06) : mix('#F0F0F5', primary, 0.035);
  const border = dark ? mix('#2C2A37', primary, 0.06) : mix('#E5E5EC', primary, 0.04);

  const soft = (color: string) => mix(surface, color, dark ? 0.2 : 0.11);
  const status = {
    success: dark ? '#34D399' : '#15A34A',
    warning: dark ? '#FBBF24' : '#C2780A',
    danger: dark ? '#F87171' : '#DC2626',
    info: dark ? '#60A5FA' : '#2563EB',
  };

  return {
    primary,
    primaryForeground,
    primaryText: ensureContrast(primary, background, 4.5),
    primarySoft: soft(primary),
    accent,
    accentSoft: soft(accent),
    accentText: ensureContrast(accent, surface, 3.5),

    background,
    surface,
    surfaceMuted,
    surfacePressed: dark ? mix(surface, '#FFFFFF', 0.06) : mix(surface, primary, 0.06),
    border,
    borderStrong: dark ? mix(border, '#FFFFFF', 0.12) : mix(border, '#000000', 0.1),

    text: dark ? '#F3F2F8' : '#16151F',
    textSecondary: dark ? '#B6B4C4' : '#575567',
    textMuted: dark ? '#82808F' : '#8A8899',

    success: status.success,
    successSoft: soft(status.success),
    warning: status.warning,
    warningSoft: soft(status.warning),
    danger: status.danger,
    dangerSoft: soft(status.danger),
    info: status.info,
    infoSoft: soft(status.info),

    overlay: withAlpha('#000000', dark ? 0.6 : 0.4),
    skeleton: dark ? mix(surface, '#FFFFFF', 0.08) : mix('#ECECF2', primary, 0.03),
    shadow: dark ? '#000000' : mix('#1B1830', primary, 0.2),
  };
}
