import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/api/queryClient';
import { ErrorFallback } from '@/components/ErrorFallback';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ForceUpdateScreen, MaintenanceScreen } from '@/features/bootstrap/GateScreens';
import { configureForegroundNotifications } from '@/features/push/handler';
import { useAppBadge, useNotificationRouting, usePushRegistration } from '@/features/push/usePushNotifications';
import { useHomeRoute } from '@/features/navigation/tabs';
import { useRealtime } from '@/features/realtime/useRealtime';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { ConfigProvider, useConfig } from '@/providers/config/ConfigProvider';
import { OnboardingProvider, useOnboarding } from '@/providers/OnboardingProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { getAppVersion } from '@/utils/env';
import { isVersionBelow } from '@/utils/semver';

/** Modal forms: native page sheet with swipe-to-dismiss on iOS, slide-up screen on Android. */
const MODAL = { presentation: 'modal', animation: Platform.OS === 'android' ? 'slide_from_bottom' : 'default' } as const;

// Keep the native splash up until the first config/session decision is made.
SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: true, duration: 250 });
configureForegroundNotifications();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ConfigProvider>
            <ThemedApp />
          </ConfigProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedApp() {
  const { config } = useConfig();
  return (
    <ThemeProvider theme={config.theme}>
      <OnboardingProvider>
        <AuthProvider>
          <AppGate />
        </AuthProvider>
      </OnboardingProvider>
    </ThemeProvider>
  );
}

/** Gate order: maintenance → force update → (onboarding → login → tabs, via protected routes). */
function AppGate() {
  const config = useConfig();
  const auth = useAuth();
  const onboarding = useOnboarding();
  const ready = config.ready && auth.status !== 'loading' && onboarding.ready && auth.userResolved;
  // Latched: the splash only covers the first decision; later loading states render inside the navigator.
  const [booted, setBooted] = useState(false);
  if (ready && !booted) setBooted(true);

  useEffect(() => {
    if (booted) SplashScreen.hideAsync().catch(() => undefined);
  }, [booted]);

  if (!booted) return null;
  if (config.isMaintenance) return <MaintenanceScreen />;
  if (isVersionBelow(getAppVersion(), config.config.app.minAppVersion)) return <ForceUpdateScreen />;
  return <RootNavigator />;
}

function RootNavigator() {
  const theme = useTheme();
  const { config, isEnabled } = useConfig();
  const { status, settings, needsSetup, userResolved } = useAuth();
  const { seen: onboardingSeen } = useOnboarding();
  const signedIn = status === 'signedIn';
  const inApp = signedIn && !needsSetup;
  const signedOutHome = onboardingSeen ? '/login' : '/onboarding';
  const homeRoute = useHomeRoute();
  const signedInHome = needsSetup ? '/setup' : homeRoute;

  usePushRegistration({
    // Waits for the user's settings so a user who turned push off is never prompted, and for first-run
    // setup, which asks for notification permission at the right moment.
    enabled: inApp && userResolved && config.features.pushNotifications && settings?.pushNotifications === true,
    brandColor: theme.colors.primary,
  });
  useNotificationRouting({ signedIn, isEnabled });
  useAppBadge(signedIn);
  useRealtime(signedIn);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontSize: 17, fontWeight: '600', color: theme.colors.text },
          headerShadowVisible: false,
          // iOS keeps its native push animation and edge back-swipe; Android slides in.
          animation: Platform.OS === 'android' ? 'slide_from_right' : 'default',
          gestureEnabled: true,
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Protected guard={signedIn && needsSetup} redirectTo={signedIn ? signedInHome : signedOutHome}>
          <Stack.Screen name="setup" options={{ animation: 'fade', gestureEnabled: false }} />
        </Stack.Protected>

        <Stack.Protected guard={inApp} redirectTo={signedIn ? '/setup' : signedOutHome}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="meeting/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="meeting/new" options={{ headerShown: true, title: 'Add meeting', ...MODAL }} />
          <Stack.Screen name="reminder/edit" options={{ headerShown: true, title: 'Reminder', ...MODAL }} />
          <Stack.Screen
            name="action-item/edit"
            options={{ headerShown: true, title: 'Action item', ...MODAL }}
          />
          <Stack.Screen name="analytics" options={{ headerShown: true, title: 'Insights' }} />
          <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications' }} />
          <Stack.Screen name="threads" options={{ headerShown: true, title: 'Conversations' }} />
        </Stack.Protected>

        <Stack.Protected guard={!signedIn && !onboardingSeen} redirectTo={signedIn ? signedInHome : '/login'}>
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        </Stack.Protected>

        <Stack.Protected guard={!signedIn && onboardingSeen} redirectTo={signedIn ? signedInHome : '/onboarding'}>
          <Stack.Screen name="login" options={{ animation: 'fade' }} />
          <Stack.Screen name="email-sign-in" options={{ headerShown: true, title: '' }} />
        </Stack.Protected>

        <Stack.Screen name="index" />
        <Stack.Screen name="auth/callback" options={{ animation: 'fade' }} />
        <Stack.Screen name="page/[slug]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="+not-found" options={{ headerShown: true, title: 'Not found' }} />
      </Stack>
      {signedIn && !userResolved ? (
        <View style={[StyleSheet.absoluteFill, styles.loading, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : null}
      <OfflineBanner />
    </>
  );
}

/** Root crash screen: branded from the last applied config, rendered even if providers failed. */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ErrorFallback {...props} scope="root" />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
