import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect, useState } from 'react';
import { Appearance, Pressable, StyleSheet, Text, View } from 'react-native';

import { isApiError } from '@/api/errors';
import { getLastKnownConfig } from '@/providers/config/lastKnown';
import { createAppTheme, useOptionalTheme } from '@/theme/ThemeProvider';
import { reportError } from '@/utils/logger';

/**
 * Branded crash screen for route error boundaries. Works with or without providers mounted (the root
 * boundary renders outside them), using the last applied config for colours and the app name.
 */
export function ErrorFallback({ error, retry, scope }: ErrorBoundaryProps & { scope: string }) {
  const contextTheme = useOptionalTheme();
  const [retrying, setRetrying] = useState(false);
  const config = getLastKnownConfig();
  const theme =
    contextTheme ?? createAppTheme(config.theme, Appearance.getColorScheme() === 'dark' && config.theme.defaultMode !== 'light' ? 'dark' : 'light');
  const { colors } = theme;
  const reference = isApiError(error) ? error.requestId : null;

  useEffect(() => {
    reportError(error, { source: 'error-boundary', boundary: scope });
  }, [error, scope]);

  const onRetry = async () => {
    setRetrying(true);
    try {
      await retry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]} accessibilityRole="alert">
      <View style={[styles.mark, { backgroundColor: colors.primary, borderRadius: theme.radii.lg }]}>
        <Text style={[styles.markText, { color: colors.primaryForeground }]}>{(config.branding.appName[0] ?? '!').toUpperCase()}</Text>
      </View>
      <Text style={[styles.title, { color: colors.text }]}>Something went wrong</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {config.branding.appName} hit an unexpected problem on this screen. Your data is safe.
      </Text>
      {reference ? <Text style={[styles.ref, { color: colors.textMuted }]}>Reference: {reference}</Text> : null}
      {__DEV__ ? (
        <Text style={[styles.dev, { color: colors.textMuted }]} numberOfLines={4}>
          {error.message}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try again"
        disabled={retrying}
        onPress={() => void onRetry()}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary, borderRadius: theme.radii.md, opacity: pressed || retrying ? 0.8 : 1 },
        ]}
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{retrying ? 'Retrying…' : 'Try again'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  mark: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  markText: {
    fontSize: 28,
    fontWeight: '800',
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 340,
  },
  ref: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  dev: {
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 340,
  },
  button: {
    marginTop: 8,
    minHeight: 48,
    minWidth: 160,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
