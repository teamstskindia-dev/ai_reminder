import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useDismissNudge, useNudge, useNudgeReply } from '@/api/hooks/companion';
import { useProfile } from '@/api/hooks/onboarding';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/StateViews';
import { pick } from '@/features/setup/shared';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { toast } from '@/utils/toast';

import { CompanionChat, type ChatLine } from './CompanionChat';

/** A proactive nudge from the friend ("How did the investor call go?") and the short chat after it. */
export function NudgeScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const nudge = useNudge(id);
  const reply = useNudgeReply(id);
  const dismiss = useDismissNudge();
  const lang = useProfile().data?.languageStyle ?? 'english';
  const [pending, setPending] = useState<string | null>(null);

  const n = nudge.data;
  const history: ChatLine[] = n?.messages.length ? n.messages : n ? [{ role: 'assistant', content: n.text }] : [];
  const lines = [...history, ...(pending ? [{ role: 'user' as const, content: pending }] : [])];
  const replied = history.some((m) => m.role === 'user');

  const send = (text: string) => {
    setPending(text);
    reply.mutate(text, {
      onSettled: () => setPending(null),
      onError: (e) => toast(getErrorMessage(e, pick(lang, "I couldn't reply just now.", 'Abhi reply nahi kar paaya.'))),
    });
  };

  const notNow = () => {
    dismiss.mutate(id);
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: pick(lang, 'From your friend', 'Aapke friend se') }} />
      {nudge.isPending ? (
        <View style={styles.loading}>
          <Skeleton height={64} radius={20} width="80%" />
        </View>
      ) : nudge.isError || !n ? (
        <ErrorState error={nudge.error} onRetry={() => void nudge.refetch()} retrying={nudge.isFetching} />
      ) : (
        <CompanionChat
          lines={lines}
          onSend={send}
          thinking={reply.isPending}
          lang={lang}
          footer={
            replied ? null : (
              <Button label={pick(lang, 'Not now', 'Abhi nahi')} variant="ghost" size="sm" disabled={reply.isPending} onPress={notNow} />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loading: {
    padding: 16,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
});
