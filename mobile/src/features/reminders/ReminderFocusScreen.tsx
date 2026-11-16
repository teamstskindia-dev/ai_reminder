import { router, Stack, useLocalSearchParams } from 'expo-router';
import { AlarmClock, Check, CheckCircle2, Clock, Moon, Pencil, Sun } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getErrorMessage } from '@/api/errors';
import { useProfile } from '@/api/hooks/onboarding';
import { useCompleteReminder, useReminder, useSnoozeReminder, type SnoozeChoice } from '@/api/hooks/reminders';
import type { Reminder } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { pick } from '@/features/setup/shared';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { formatDayLabel, formatTime, tomorrowAt } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { toast } from '@/utils/toast';

import { openReminderEditor } from './useReminderMenu';

/** Tonight at 8 PM, offered only until 7:30 PM. */
function tonight(now = new Date()): Date | null {
  const at = new Date(now);
  at.setHours(20, 0, 0, 0);
  return at.getTime() - now.getTime() >= 30 * 60_000 ? at : null;
}

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

/** "Reminder with Done / Snooze" (user-flow §03 and §12): opened from the reminder's notification. */
export function ReminderFocusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reminder = useReminder(id ?? '');
  const lang = useProfile().data?.languageStyle ?? 'english';
  const done = useCompleteReminder();
  const snooze = useSnoozeReminder();

  const r = reminder.data;
  const open = r && (r.status === 'pending' || r.status === 'sent');
  const evening = tonight();
  const tomorrow = tomorrowAt(9);

  const markDone = (target: Reminder) => {
    haptics.success();
    done.mutate(target, {
      onSuccess: () => {
        toast(pick(lang, 'Nice one! Marked done.', 'Badhiya! Ho gaya mark.'));
        leave();
      },
      onError: (e) => toast(getErrorMessage(e, pick(lang, "Couldn't mark it done.", 'Done mark nahi ho paaya.'))),
    });
  };

  const doSnooze = (target: Reminder, choice: SnoozeChoice, label: string) => {
    haptics.light();
    snooze.mutate(
      { reminder: target, choice },
      {
        onSuccess: () => {
          toast(pick(lang, `Okay, I'll remind you ${label}.`, `Theek hai, ${label} yaad dilaunga.`));
          leave();
        },
        onError: (e) => toast(getErrorMessage(e, pick(lang, "Couldn't snooze it.", 'Snooze nahi ho paaya.'))),
      },
    );
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: pick(lang, 'Reminder', 'Reminder') }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        {reminder.isPending ? (
          <Skeleton height={140} radius={16} />
        ) : reminder.isError || !r ? (
          <ErrorState error={reminder.error} onRetry={() => void reminder.refetch()} retrying={reminder.isFetching} />
        ) : (
          <>
            <Card>
              <View style={styles.head}>
                <View style={[styles.icon, { backgroundColor: theme.colors.primarySoft }]}>
                  <AlarmClock size={24} color={theme.colors.primaryText} />
                </View>
                <View style={styles.flex}>
                  <Text variant="heading">{r.title}</Text>
                  <Text variant="caption" tone="secondary">
                    {formatDayLabel(r.remindAt)} · {formatTime(r.remindAt)}
                    {r.meetingTitle ? ` · ${r.meetingTitle}` : ''}
                  </Text>
                </View>
              </View>
              {r.body ? (
                <Text variant="body" tone="secondary" style={styles.body}>
                  {r.body}
                </Text>
              ) : null}
            </Card>

            {r.status === 'done' ? (
              <Card muted>
                <View style={styles.head}>
                  <CheckCircle2 size={22} color={theme.colors.success} />
                  <Text variant="callout">{pick(lang, 'Done. Nice work!', 'Ho gaya. Badhiya!')}</Text>
                </View>
              </Card>
            ) : !open ? (
              <Card muted>
                <Text variant="callout" tone="secondary">
                  {pick(lang, 'This reminder was cancelled.', 'Yeh reminder cancel ho gaya tha.')}
                </Text>
              </Card>
            ) : (
              <View style={styles.actions}>
                <Button label={pick(lang, 'Done', 'Ho gaya')} icon={Check} size="lg" fullWidth loading={done.isPending} onPress={() => markDone(r)} />
                <Text variant="micro" tone="muted" style={styles.snoozeTitle}>
                  {pick(lang, 'SNOOZE', 'BAAD MEIN')}
                </Text>
                <View style={styles.grid}>
                  <Button label="15 min" icon={Clock} variant="secondary" style={styles.cell} disabled={snooze.isPending} onPress={() => doSnooze(r, { kind: 'minutes', minutes: 15 }, pick(lang, 'in 15 minutes', '15 minute mein'))} />
                  <Button label={pick(lang, '1 hour', '1 ghanta')} icon={AlarmClock} variant="secondary" style={styles.cell} disabled={snooze.isPending} onPress={() => doSnooze(r, { kind: 'minutes', minutes: 60 }, pick(lang, 'in an hour', '1 ghante mein'))} />
                  {evening ? (
                    <Button label={pick(lang, 'Tonight', 'Aaj raat')} icon={Moon} variant="secondary" style={styles.cell} disabled={snooze.isPending} onPress={() => doSnooze(r, { kind: 'until', date: evening }, pick(lang, `tonight at ${formatTime(evening)}`, `aaj raat ${formatTime(evening)} pe`))} />
                  ) : null}
                  <Button label={pick(lang, 'Tomorrow', 'Kal')} icon={Sun} variant="secondary" style={styles.cell} disabled={snooze.isPending} onPress={() => doSnooze(r, { kind: 'until', date: tomorrow }, pick(lang, `tomorrow at ${formatTime(tomorrow)}`, `kal ${formatTime(tomorrow)} pe`))} />
                </View>
                <Button label={pick(lang, 'Edit reminder', 'Reminder badlo')} icon={Pencil} variant="ghost" onPress={() => openReminderEditor(r)} />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: 16,
    gap: 16,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    marginTop: 12,
  },
  actions: {
    gap: 10,
  },
  snoozeTitle: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cell: {
    flexGrow: 1,
    flexBasis: '45%',
  },
});
