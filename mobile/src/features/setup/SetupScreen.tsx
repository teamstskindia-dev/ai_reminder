import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIntegrations } from '@/api/hooks/profile';
import type { LanguageStyle, OnboardingChatMessage } from '@/api/types';
import { Logo } from '@/components/brand/Logo';
import { IconButton } from '@/components/ui/IconButton';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useAuth } from '@/providers/AuthProvider';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';

import { clearProgress, loadProgress, saveProgress, type StepKey } from './shared';
import { ChatStep } from './steps/ChatStep';
import { ConnectStep } from './steps/ConnectStep';
import { ConsentStep, NudgeStep, RhythmStep } from './steps/FinalSteps';
import { MicStep, NotificationsStep } from './steps/PermissionSteps';

/** Steps that can't be revisited with Back (they act on the OS or are already answered). */
const NO_BACK_TO: StepKey[] = ['chat', 'mic', 'notifications'];

/**
 * First-run setup after sign-in (user-flow §02 "Onboarding and first run"):
 * connect Calendar (Google sign-ins) → get-to-know-you chat → mic → notifications → daily rhythm →
 * recording note → first nudge → Today. Progress survives an app restart.
 */
export function SetupScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, finishSetup } = useAuth();
  const { isEnabled } = useConfig();
  const integrations = useIntegrations(isEnabled('calendarSync'));
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<StepKey | null>(null);
  const [messages, setMessages] = useState<OnboardingChatMessage[]>([]);
  const [lang, setLang] = useState<LanguageStyle>('english');
  const userId = user?.id ?? null;

  // Google sign-ins have a Google account row; email sign-ins skip the Calendar offer (flow: D → E).
  const hasGoogle = Boolean(integrations.data?.some((i) => i.provider === 'google_calendar' && i.accountEmail));
  const calendarDecided = !isEnabled('calendarSync') || !integrations.isPending;
  const steps = useMemo<StepKey[]>(
    () => [...(hasGoogle ? (['connect'] as const) : []), 'chat', 'mic', 'notifications', 'rhythm', 'consent', 'nudge'],
    [hasGoogle],
  );

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void loadProgress(userId).then((saved) => {
      if (cancelled) return;
      if (saved) {
        setStep(saved.step);
        setMessages(saved.messages ?? []);
        setLang(saved.lang ?? 'english');
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const current: StepKey | null = loaded && calendarDecided ? (step && steps.includes(step) ? step : steps[0]) : null;
  const index = current ? steps.indexOf(current) : 0;

  useEffect(() => {
    if (userId && current) void saveProgress(userId, { step: current, messages, lang });
  }, [userId, current, messages, lang]);

  const goNext = useCallback(() => {
    const next = steps[index + 1];
    if (next) setStep(next);
  }, [steps, index]);

  const prev = index > 0 ? steps[index - 1] : null;
  const canGoBack = Boolean(prev && !NO_BACK_TO.includes(prev) && current !== 'chat');
  const goBack = useCallback(() => {
    if (canGoBack && prev) setStep(prev);
  }, [canGoBack, prev]);

  // Android back: step back inside setup instead of leaving the app half set up.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) goBack();
      return true;
    });
    return () => sub.remove();
  }, [canGoBack, goBack]);

  const onFinish = async () => {
    await finishSetup();
    if (userId) await clearProgress(userId);
    // The root guards now send the user to Today.
  };

  const renderStep = () => {
    switch (current) {
      case 'connect':
        return <ConnectStep onNext={goNext} lang={lang} />;
      case 'chat':
        return <ChatStep messages={messages} setMessages={setMessages} lang={lang} setLang={setLang} onNext={goNext} />;
      case 'mic':
        return <MicStep onNext={goNext} lang={lang} />;
      case 'notifications':
        return <NotificationsStep onNext={goNext} lang={lang} />;
      case 'rhythm':
        return <RhythmStep onNext={goNext} lang={lang} />;
      case 'consent':
        return <ConsentStep onNext={goNext} lang={lang} />;
      case 'nudge':
        return <NudgeStep onFinish={onFinish} lang={lang} />;
      default:
        return (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        );
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {canGoBack ? (
            <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={goBack} />
          ) : (
            <View style={styles.headerSpacer} />
          )}
          <Logo size={26} />
          <View style={styles.headerSpacer} />
        </View>
        <ProgressBar value={current ? (index + 1) / steps.length : 0} height={4} />
      </View>
      <View key={current ?? 'loading'} style={styles.flex}>
        {renderStep()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  headerSpacer: {
    width: 48,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
