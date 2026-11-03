'use client';

import { useSetting } from '@/lib/api/settings';
import type { Branding, Theme } from '@/lib/api/types';

import { safeColor, safeFontFamily } from '@/lib/security/safe-url';

import { DEFAULT_BRANDING, DEFAULT_THEME } from './defaults';

/** The saved theme (or seed defaults) for previews that are not editing the theme itself. */
export function usePreviewTheme(): Theme {
  const theme = useSetting('theme');
  return theme.data?.value ?? DEFAULT_THEME;
}

export function usePreviewBranding(): Branding {
  const branding = useSetting('branding');
  return branding.data?.value ?? DEFAULT_BRANDING;
}

/** Theme values safe to put in a style object: invalid colours/fonts fall back to the seed defaults. */
export function sanitizeTheme(theme: Partial<Theme>): Theme {
  const radius = Number(theme.radius);
  return {
    primaryColor: safeColor(theme.primaryColor, DEFAULT_THEME.primaryColor),
    primaryForeground: safeColor(theme.primaryForeground, DEFAULT_THEME.primaryForeground),
    accentColor: safeColor(theme.accentColor, DEFAULT_THEME.accentColor),
    sidebarBackground: safeColor(theme.sidebarBackground, DEFAULT_THEME.sidebarBackground),
    sidebarForeground: safeColor(theme.sidebarForeground, DEFAULT_THEME.sidebarForeground),
    radius: Number.isFinite(radius) ? Math.min(48, Math.max(0, radius)) : DEFAULT_THEME.radius,
    fontFamily: safeFontFamily(theme.fontFamily, DEFAULT_THEME.fontFamily),
    defaultMode: theme.defaultMode === 'dark' || theme.defaultMode === 'system' ? theme.defaultMode : 'light',
  };
}

/**
 * Inline CSS variables that let preview markup use the brand colours (`var(--pv-primary)` etc.). Values are
 * validated first (hex colours, font-name pattern, clamped radius) — raw input never reaches CSS.
 */
export function themeVars(input: Partial<Theme>): React.CSSProperties {
  const theme = sanitizeTheme(input);
  return {
    '--pv-primary': theme.primaryColor,
    '--pv-primary-fg': theme.primaryForeground,
    '--pv-accent': theme.accentColor,
    '--pv-sidebar': theme.sidebarBackground,
    '--pv-sidebar-fg': theme.sidebarForeground,
    '--pv-radius': `${theme.radius}px`,
    fontFamily: `"${theme.fontFamily}", ui-sans-serif, system-ui, sans-serif`,
  } as React.CSSProperties;
}
