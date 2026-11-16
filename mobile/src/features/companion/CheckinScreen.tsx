import { router, Stack } from 'expo-router';
import { CheckCircle2, MoonStar } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useCheckinFinish, useCheckinReply, useCheckinToday } from '@/api/hooks/companion';
import { useProfile } from '@/api/hooks/onboarding';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { pick } from '@/features/setup/shared';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { haptics } from '@/utils/haptics';
import { toast } from '@/utils/toast';

import { CompanionChat, type ChatLine } from './CompanionChat';
import { MOOD_EMOJI } from './mood';

/**
 * Evening check-in (user-flow §03): "how did today go?". The friend listens and reflects; after a few
 * replies (or "Wrap up") it closes with tomorrow's plan and what is still open, and notes the mood.
 */
export function CheckinScreen() {
  const theme = useTheme();
  const checkin = useCheckinToday();
  const reply = useCheckinReply();
  const finish = useCheckinFinish();
  const lang = useProfile().data?.languageStyle ?? 'english';
  const [pending, setPending] = useState<string | null>(null);

  const c = checkin.data;
  const lines: ChatLine[] = [...(c?.messages ?? []), ...(pending ? [{ role: 'user' as const, content: pending }] : [])];
  const replied = c?.messages.some((m) => m.role === 'user') ?? false;
  const done = c?.status === 'completed';
  const busy = reply.isPending || finish.isPending;

  const send = (text: string) => {
    setPending(text);
    reply.mutate(text, {
      onSuccess: (res) => {
        setPending(null);
        if (res.done) haptics.success();
      },
      onError: (e) => {
        setPending(null);
        toast(getErrorMessage(e, pick(lang, "I couldn't reply just now. Try again?", 'Abhi reply nahi kar paaya. Phir se try karo?')));
      },
    });
  };

  const wrapUp = () =>
    finish.mutate(undefined, {
      onSuccess: () => haptics.success(),
      onError: (e) => toast(getErrorMessage(e, pick(lang, "Couldn't wrap up just now.", 'Abhi wrap up nahi ho paaya.'))),
    });

  const footer = done ? (
    <Card muted style={styles.doneCard}>
      <View style={styles.doneRow}>
        <CheckCircle2 size={20} color={theme.colors.success} />
        <Text variant="callout" style={styles.flex}>
          {pick(lang, 'Check-in done for today.', 'Aaj ka check-in ho gaya.')}
          {c?.mood ? ` ${MOOD_EMOJI[c.mood]}` : ''}
        </Text>
      </View>
      <Button label={pick(lang, 'Back to Today', 'Today par chalo')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} fullWidth />
    </Card>
  ) : replied ? (
    <Button label={pick(lang, 'Wrap up', 'Bas, aaj ke liye itna')} variant="ghost" size="sm" disabled={busy} onPress={wrapUp} />
  ) : null;

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: pick(lang, 'Evening check-in', 'Evening check-in') }} />
      {checkin.isPending ? (
        <View style={styles.loading}>
          <Skeleton height={64} radius={20} width="80%" />
        </View>
      ) : checkin.isError || !c ? (
        <ErrorState error={checkin.error} onRetry={() => void checkin.refetch()} retrying={checkin.isFetching} />
      ) : (
        <CompanionChat
          lines={lines}
          onSend={send}
          thinking={busy}
          lang={lang}
          closed={done}
          footer={footer}
          header={
            <View style={styles.intro}>
              <MoonStar size={16} color={theme.colors.textMuted} />
              <Text variant="caption" tone="muted">
                {pick(lang, 'Just between us. Voice or text, whatever is easier.', 'Bas hum dono ke beech. Bolo ya likho, jo aasaan ho.')}
              </Text>
            </View>
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
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  doneCard: {
    width: '100%',
    gap: 12,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
