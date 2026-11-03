import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { CircleAlert, CircleCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLoginHero, useOnboardingSlides } from '@/api/hooks/content';
import { Logo } from '@/components/brand/Logo';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useAuth } from '@/providers/AuthProvider';
import { useConfig } from '@/providers/config/ConfigProvider';
import { DEFAULT_ONBOARDING } from '@/providers/config/defaultConfig';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/utils/toast';

import { GoogleMark } from './GoogleMark';
import { openGoogleSignIn, signInErrorMessage, signInFailureMessage } from './google';

type Phase = 'idle' | 'browser' | 'exchanging';

export function LoginScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { config } = useConfig();
  const { branding, features } = config;
  const { completeSignIn } = useAuth();
  const hero = useLoginHero().data ?? null;
  const slides = useOnboardingSlides().data;
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  // Pre-warm Chrome Custom Tabs so the consent screen opens instantly (Android only; iOS uses
  // ASWebAuthenticationSession, which needs no warm-up).
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    WebBrowser.warmUpAsync().catch(() => undefined);
    return () => {
      WebBrowser.coolDownAsync().catch(() => undefined);
    };
  }, []);

  const illustration =
    hero?.imageUrl ?? slides?.[0]?.content.imageUrl ?? DEFAULT_ONBOARDING[0]?.content.imageUrl ?? null;
  const title = hero?.title ?? `Welcome to ${branding.appName}`;
  const subtitle = hero?.subtitle ?? branding.tagline;
  const badges = hero?.badges ?? [];
  const busy = phase !== 'idle';

  const signIn = async () => {
    setError(null);
    setPhase('browser');
    try {
      const result = await openGoogleSignIn();
      if (result.type === 'cancelled') {
        setPhase('idle');
        return;
      }
      if (result.type === 'error') {
        setError(signInErrorMessage(result.error, branding));
        setPhase('idle');
        return;
      }
      setPhase('exchanging');
      const { isNewUser } = await completeSignIn(result.code);
      if (isNewUser) toast(`Welcome to ${branding.appName}! Your calendar is syncing.`);
    } catch (error) {
      setError(signInFailureMessage(error));
      setPhase('idle');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}
      bounces={false}
    >
      <Logo size={32} />

      <View style={[styles.illustration, { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.xl }]}>
        {illustration && !imageFailed ? (
          <Image
            source={{ uri: illustration }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            accessibilityIgnoresInvertColors
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Logo variant="icon" size={96} />
        )}
      </View>

      <View style={styles.copy}>
        <Text variant="display">{title}</Text>
        {subtitle ? (
          <Text variant="body" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
        {badges.length ? (
          <View style={styles.badges}>
            {badges.map((badge) => (
              <View key={badge} style={styles.badge}>
                <CircleCheck size={16} color={theme.colors.success} />
                <Text variant="caption" tone="secondary">
                  {badge}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.spacer} />

      {error ? (
        <View accessibilityLiveRegion="polite" style={[styles.error, { backgroundColor: theme.colors.dangerSoft, borderRadius: theme.radii.md }]}>
          <CircleAlert size={18} color={theme.colors.danger} />
          <Text variant="callout" tone="danger" style={styles.errorText}>
            {error}
          </Text>
        </View>
      ) : null}

      <Touchable
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={() => void signIn()}
        style={({ pressed }) => [
          styles.google,
          theme.elevation.card,
          {
            backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
            borderRadius: theme.radii.md,
            borderColor: theme.colors.borderStrong,
          },
        ]}
      >
        {busy ? <ActivityIndicator color={theme.colors.primary} /> : <GoogleMark size={20} />}
        <Text variant="bodyStrong">{phase === 'exchanging' ? 'Signing you in…' : 'Continue with Google'}</Text>
      </Touchable>

      {!features.signupsEnabled ? (
        <Text variant="caption" tone="muted" align="center">
          New sign-ups are paused. Existing accounts can still sign in.
        </Text>
      ) : null}

      <Text variant="caption" tone="muted" align="center" style={styles.legal}>
        By continuing you agree to the{' '}
        <Text variant="caption" tone="brand" onPress={() => router.push('/page/terms')} accessibilityRole="link">
          Terms
        </Text>{' '}
        and{' '}
        <Text variant="caption" tone="brand" onPress={() => router.push('/page/privacy')} accessibilityRole="link">
          Privacy Policy
        </Text>
        .
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },
  illustration: {
    width: '100%',
    aspectRatio: 1.15,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    gap: 8,
  },
  badges: {
    marginTop: 6,
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spacer: {
    flexGrow: 1,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
  },
  errorText: {
    flex: 1,
  },
  google: {
    overflow: 'hidden',
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
  },
  legal: {
    paddingHorizontal: 12,
  },
});
