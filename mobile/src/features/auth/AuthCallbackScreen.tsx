import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { CircleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/brand/Logo';
import { EmptyState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { useHomeRoute } from '@/features/navigation/tabs';
import { useAuth } from '@/providers/AuthProvider';
import { useBranding } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';

import {
  cancelPendingSignIn,
  hasPendingSignIn,
  isExchangeInFlight,
  signInErrorMessage,
  signInFailureMessage,
} from './google';

// Completes a pending auth session when this route is the redirect target (only acts on web; a no-op on
// iOS/Android, where the session result or the deep link below carries the code).
WebBrowser.maybeCompleteAuthSession();

function readParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first.length > 0 && first.length < 2048 ? first : null;
}

/**
 * Deep-link target `remi://auth/callback?code=…|error=…`. Completes the same PKCE exchange as the login
 * screen (de-duplicated). Callbacks this app instance did not start are ignored — no exchange happens
 * without the in-memory verifier (e.g. after the app was killed mid sign-in).
 */
export function AuthCallbackScreen() {
  const theme = useTheme();
  const branding = useBranding();
  const homeRoute = useHomeRoute();
  const { completeSignIn } = useAuth();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const code = readParam(params.code);
  const errorCode = readParam(params.error);
  // Decided once, when the callback arrives.
  const [initiated] = useState(() => (code ? isExchangeInFlight(code) || hasPendingSignIn() : hasPendingSignIn()));
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  useEffect(() => {
    if (initiated && errorCode) cancelPendingSignIn();
  }, [initiated, errorCode]);

  useEffect(() => {
    if (!initiated || !code || errorCode) return;
    let cancelled = false;
    completeSignIn(code)
      .then(() => {
        if (cancelled) return;
        // Re-auth while signed in (calendar reconnect) returns to where the user was.
        if (router.canGoBack()) router.back();
        else router.replace(homeRoute);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setExchangeError(signInFailureMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [initiated, code, errorCode, completeSignIn, homeRoute]);

  const failure = !initiated
    ? signInErrorMessage('no_pending')
    : errorCode
      ? signInErrorMessage(errorCode, branding)
      : !code
        ? signInErrorMessage('oauth_failed')
        : exchangeError;

  if (failure) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        <EmptyState
          icon={CircleAlert}
          title="Sign-in didn't finish"
          message={failure}
          action={{ label: 'Back to sign in', onPress: () => router.replace('/') }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, styles.center, { backgroundColor: theme.colors.background }]}>
      <Logo variant="icon" size={56} />
      <ActivityIndicator color={theme.colors.primary} style={styles.spinner} />
      <Text variant="body" tone="secondary">
        Signing you in…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  spinner: {
    marginTop: 12,
  },
});
