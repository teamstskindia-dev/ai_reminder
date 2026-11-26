import { router } from 'expo-router';
import { CheckCircle2, CircleAlert, CloudOff, Mic, RotateCw, Sparkles, UploadCloud } from 'lucide-react-native';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';

import { useCaptures } from '@/api/hooks/captures';
import type { CaptureListItem, LanguageStyle } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { pick } from '@/features/setup/shared';
import { useNow } from '@/hooks/useNow';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDuration } from '@/utils/format';

import { getActiveRecording } from './activeRecording';
import { belongsTo, removeCapture, useLocalCaptures, type LocalCapture } from './captureStore';
import { retryLocalCapture } from './uploadQueue';

/** Recordings worth a card on Today: still on the phone, processing, failed, or ready but not reviewed. */
const REVIEW_WINDOW_MS = 3 * 24 * 3600_000;

function Icon({ tint, bg, children }: { tint?: string; bg: string; children: React.ReactNode }) {
  return <View style={[styles.roundIcon, { backgroundColor: bg, borderColor: tint ?? 'transparent' }]}>{children}</View>;
}

function LocalCard({ c, lang, online }: { c: LocalCapture; lang: LanguageStyle; online: boolean }) {
  const theme = useTheme();
  const duration = formatDuration(c.durationMs / 1000);
  const title = c.title || pick(lang, 'New recording', 'Nayi recording');
  const failed = c.state === 'failed';
  const waiting = !online && !failed;

  const discard = () =>
    Alert.alert(pick(lang, 'Delete this recording?', 'Ye recording delete karein?'), pick(lang, 'It hasn’t been sent yet.', 'Ye abhi bheji nahi gayi.'), [
      { text: pick(lang, 'Cancel', 'Rehne do'), style: 'cancel' },
      { text: pick(lang, 'Delete', 'Delete karo'), style: 'destructive', onPress: () => void removeCapture(c.clientId) },
    ]);

  return (
    <Card>
      <View style={styles.row}>
        <Icon bg={failed ? theme.colors.dangerSoft : theme.colors.infoSoft}>
          {failed ? (
            <CircleAlert size={18} color={theme.colors.danger} />
          ) : waiting ? (
            <CloudOff size={18} color={theme.colors.info} />
          ) : (
            <UploadCloud size={18} color={theme.colors.info} />
          )}
        </Icon>
        <View style={styles.flex}>
          <Text variant="subheading" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" tone="secondary">
            {failed
              ? c.permanent
                ? (c.lastError ?? pick(lang, 'Couldn’t send it.', 'Bhej nahi paaye.'))
                : pick(lang, 'Couldn’t send yet. I’ll keep trying.', 'Abhi nahi bhej paaya. Koshish karta rahunga.')
              : waiting
                ? pick(lang, 'Saved on your phone. I’ll send it when you’re back online.', 'Phone mein save hai. Net aate hi bhej dunga.')
                : pick(lang, 'Sending…', 'Bhej raha hoon…')}
            {duration ? ` · ${duration}` : ''}
          </Text>
        </View>
        {!failed && !waiting ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
      </View>
      {failed ? (
        <View style={styles.actions}>
          {!c.permanent ? <Button label={pick(lang, 'Try now', 'Abhi try karo')} icon={RotateCw} size="sm" onPress={() => void retryLocalCapture(c.clientId)} /> : null}
          <Button label={pick(lang, 'Delete', 'Delete karo')} size="sm" variant="ghost" onPress={discard} />
        </View>
      ) : null}
    </Card>
  );
}

function RemoteCard({ c, lang }: { c: CaptureListItem; lang: LanguageStyle }) {
  const theme = useTheme();
  const open = () => router.push({ pathname: '/capture/[id]', params: { id: c.id } });
  const busy = c.status === 'uploading' || c.status === 'processing';
  const found = [
    c.actionItemCount ? `${c.actionItemCount} ${pick(lang, c.actionItemCount === 1 ? 'to-do' : 'to-dos', 'to-do')}` : null,
    c.reminderCount ? `${c.reminderCount} ${pick(lang, c.reminderCount === 1 ? 'reminder' : 'reminders', 'reminder')}` : null,
  ].filter(Boolean);

  let icon = <Sparkles size={18} color={theme.colors.primaryText} />;
  let bg = theme.colors.primarySoft;
  let subtitle: string;
  if (busy) {
    subtitle = pick(lang, 'Processing… you can leave the app.', 'Process ho rahi hai… app band kar sakte ho.');
  } else if (c.status === 'failed') {
    icon = c.noSpeech ? <Mic size={18} color={theme.colors.warning} /> : <CircleAlert size={18} color={theme.colors.danger} />;
    bg = c.noSpeech ? theme.colors.warningSoft : theme.colors.dangerSoft;
    subtitle = c.noSpeech
      ? pick(lang, 'Nothing to process: no speech.', 'Process karne ko kuch nahi: koi baat nahi mili.')
      : pick(lang, 'Couldn’t process it. Tap to try again.', 'Process nahi hui. Dobara try karne ke liye tap karo.');
  } else if (c.openSuggestionCount) {
    icon = <CircleAlert size={18} color={theme.colors.warning} />;
    bg = theme.colors.warningSoft;
    subtitle = pick(
      lang,
      `${c.openSuggestionCount} ${c.openSuggestionCount === 1 ? 'thing' : 'things'} to confirm${found.length ? ` · ${found.join(', ')}` : ''}`,
      `${c.openSuggestionCount} cheez confirm karni hai${found.length ? ` · ${found.join(', ')}` : ''}`,
    );
  } else {
    icon = <CheckCircle2 size={18} color={theme.colors.success} />;
    bg = theme.colors.successSoft;
    subtitle = found.length
      ? `${pick(lang, 'Ready', 'Ready')} · ${found.join(', ')} ${pick(lang, 'found', 'mile')}`
      : pick(lang, 'Ready: summary and transcript', 'Ready: summary aur transcript');
  }

  return (
    <Card onPress={open} accessibilityLabel={`Open recording ${c.title}`}>
      <View style={styles.row}>
        <Icon bg={bg}>{icon}</Icon>
        <View style={styles.flex}>
          <Text variant="subheading" numberOfLines={1}>
            {c.title}
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Button label={pick(lang, 'Review', 'Dekho')} size="sm" variant="secondary" onPress={open} />
        )}
      </View>
    </Card>
  );
}

/** Today's recording cards (user-flow §04): sending/offline, processing, ready to review, failed. */
export function CaptureCards({ lang }: { lang: LanguageStyle }) {
  const net = useNetInfo();
  const { user } = useAuth();
  // Recordings another account left on this phone are never shown (or sent) here.
  const local = useLocalCaptures().filter(
    (c) => c.state !== 'recording' && c.clientId !== getActiveRecording() && belongsTo(c, user?.id),
  );
  const remote = useCaptures();
  const now = useNow();
  const cards = (remote.data ?? []).filter(
    (c) =>
      c.status !== 'completed' ||
      c.openSuggestionCount > 0 ||
      (!c.reviewedAt && now - new Date(c.createdAt).getTime() < REVIEW_WINDOW_MS),
  );
  if (!local.length && !cards.length) return null;
  return (
    <View style={styles.list}>
      {local.map((c) => (
        <LocalCard key={c.clientId} c={c} lang={lang} online={net.isConnected !== false} />
      ))}
      {cards.slice(0, 3).map((c) => (
        <RemoteCard key={c.id} c={c} lang={lang} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  roundIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
