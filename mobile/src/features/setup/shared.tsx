import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LanguageStyle, OnboardingChatMessage } from '@/api/types';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { readJson, writeJson } from '@/utils/storage';

export type StepKey = 'connect' | 'chat' | 'mic' | 'notifications' | 'rhythm' | 'consent' | 'nudge';

export interface StepProps {
  onNext: () => void;
  /** English, Hinglish or mixed, learned in the chat: the rest of setup mirrors it. */
  lang: LanguageStyle;
}

/** Picks the copy that mirrors how the user writes (Hinglish for hinglish/mixed). */
export function pick(lang: LanguageStyle, en: string, hi: string): string {
  return lang === 'english' ? en : hi;
}

// ---------- progress (survives an app restart mid-setup) ----------
export interface SetupProgress {
  step: StepKey;
  messages: OnboardingChatMessage[];
  lang: LanguageStyle;
}

const progressKey = (userId: string) => `remi.setup.v1.${userId}`;

export function loadProgress(userId: string): Promise<SetupProgress | null> {
  return readJson<SetupProgress>(progressKey(userId));
}

export function saveProgress(userId: string, progress: SetupProgress): Promise<void> {
  return writeJson(progressKey(userId), progress);
}

export function clearProgress(userId: string): Promise<void> {
  return writeJson(progressKey(userId), null);
}

// ---------- layout ----------
/** Hero icon, title, body and a footer of actions pinned to the bottom. */
export function StepLayout({
  icon: Icon,
  title,
  body,
  children,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  children?: ReactNode;
  footer: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body} bounces={false}>
        <View style={[styles.hero, { backgroundColor: theme.colors.primarySoft }]}>
          <Icon size={34} color={theme.colors.primaryText} />
        </View>
        <View style={styles.copy}>
          <Text variant="display">{title}</Text>
          <Text variant="body" tone="secondary">
            {body}
          </Text>
        </View>
        {children}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  body: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 20,
  },
  hero: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    gap: 8,
  },
  footer: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 8,
  },
});
