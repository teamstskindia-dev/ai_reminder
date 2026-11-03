import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme, type ViewStyle } from 'react-native';

import type { Theme } from '@/api/types';

import { elevation } from './elevation';
import { buildPalette, type ColorScheme, type Palette } from './palette';
import { buildRadii, spacing, typography, type Radii } from './tokens';

export interface AppTheme {
  scheme: ColorScheme;
  isDark: boolean;
  colors: Palette;
  radii: Radii;
  spacing: typeof spacing;
  typography: typeof typography;
  /** Subtle card elevation (shadow on light, hairline border on dark). */
  elevation: { card: ViewStyle; raised: ViewStyle };
}

const ThemeContext = createContext<AppTheme | null>(null);

export function resolveScheme(mode: Theme['defaultMode'], system: ColorScheme | null | undefined): ColorScheme {
  if (mode === 'light' || mode === 'dark') return mode;
  return system === 'dark' ? 'dark' : 'light';
}

export function createAppTheme(theme: Theme, scheme: ColorScheme): AppTheme {
  const colors = buildPalette(theme, scheme);
  const isDark = scheme === 'dark';
  return {
    scheme,
    isDark,
    colors,
    radii: buildRadii(theme.radius),
    spacing,
    typography,
    elevation: {
      card: elevation(1, colors, isDark),
      raised: elevation(3, colors, isDark),
    },
  };
}

export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  const system = useColorScheme();
  const scheme = resolveScheme(theme.defaultMode, system);
  const value = useMemo(() => createAppTheme(theme, scheme), [theme, scheme]);

  const navigationTheme = useMemo(() => {
    const base = value.isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: value.isDark,
      colors: {
        ...base.colors,
        primary: value.colors.primary,
        background: value.colors.background,
        card: value.colors.surface,
        text: value.colors.text,
        border: value.colors.border,
        notification: value.colors.danger,
      },
    };
  }, [value]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(value.colors.background).catch(() => undefined);
  }, [value.colors.background]);

  return (
    <ThemeContext.Provider value={value}>
      <NavigationThemeProvider value={navigationTheme}>
        <StatusBar style={value.isDark ? 'light' : 'dark'} />
        {children}
      </NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): AppTheme {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}

/** The theme if a ThemeProvider is mounted, otherwise null (used by error boundaries). */
export function useOptionalTheme(): AppTheme | null {
  return useContext(ThemeContext);
}
