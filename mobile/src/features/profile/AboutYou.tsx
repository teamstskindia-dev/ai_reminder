import { Sparkles, Trash } from 'lucide-react-native';
import { Alert, StyleSheet, View } from 'react-native';

import { useDeleteProfile, useProfile } from '@/api/hooks/onboarding';
import type { LanguageStyle, UserSettings } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/utils/toast';

const LANGUAGE_LABEL: Record<LanguageStyle, string> = { english: 'English', hinglish: 'Hinglish', mixed: 'English + Hinglish' };

/** "What I know about you": the personality profile from the get-to-know-you chat, deletable. */
export function AboutYou() {
  const theme = useTheme();
  const profile = useProfile();
  const remove = useDeleteProfile();
  const p = profile.data;
  const known = p && p.status === 'completed';

  const confirmForget = () =>
    Alert.alert('Forget what I know about you?', 'Your name, work, style and the facts from our first chat will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: () => remove.mutate(undefined, { onSuccess: () => toast('Done. I’ll learn again as we talk.') }),
      },
    ]);

  const rows: [string, string | null | undefined][] = [
    ['Call me', p?.preferredName],
    ['What I do', p?.occupation],
    ['On my mind', p?.currentFocus],
    ['Talk to me', p?.communicationStyle],
  ];

  return (
    <View style={styles.group}>
      <Text variant="micro" tone="muted" style={styles.title}>
        WHAT I KNOW ABOUT YOU
      </Text>
      <Card>
        {profile.isPending ? (
          <Skeleton height={60} />
        ) : !known ? (
          <View style={styles.row}>
            <Sparkles size={18} color={theme.colors.primaryText} />
            <Text variant="callout" tone="secondary" style={styles.flex}>
              Not much yet. I’ll learn about you gently as we talk.
            </Text>
          </View>
        ) : (
          <View style={styles.body}>
            {rows
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <View key={label} style={styles.item}>
                  <Text variant="caption" tone="muted">
                    {label}
                  </Text>
                  <Text variant="callout">{value}</Text>
                </View>
              ))}
            {p.facts.length ? (
              <View style={styles.item}>
                <Text variant="caption" tone="muted">
                  Things you told me
                </Text>
                {p.facts.map((fact) => (
                  <Text key={fact} variant="callout">
                    • {fact}
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={styles.chips}>
              <Chip label={LANGUAGE_LABEL[p.languageStyle]} tone="brand" />
              {p.tone ? <Chip label={p.tone} tone="accent" /> : null}
            </View>
            <Button label="Forget this" icon={Trash} variant="ghost" size="sm" onPress={confirmForget} loading={remove.isPending} style={styles.forget} />
          </View>
        )}
      </Card>
    </View>
  );
}

function toDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function toHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Wake time, quiet hours and the evening check-in (set during setup, editable here). */
export function DailyRhythmSettings({ settings, onChange }: { settings: UserSettings; onChange: (patch: Partial<UserSettings>) => void }) {
  return (
    <View style={styles.group}>
      <Text variant="micro" tone="muted" style={styles.title}>
        DAILY RHYTHM
      </Text>
      <Card>
        <View style={styles.body}>
          <DateTimeField
            mode="time"
            label="Wake-up time (morning brief)"
            value={toDate(settings.wakeTime)}
            onChange={(d) => d && onChange({ wakeTime: toHHMM(d), digestHour: d.getHours() })}
          />
          <View style={styles.pair}>
            <View style={styles.flex}>
              <DateTimeField mode="time" label="Quiet from" value={toDate(settings.quietHoursStart)} onChange={(d) => d && onChange({ quietHoursStart: toHHMM(d) })} />
            </View>
            <View style={styles.flex}>
              <DateTimeField mode="time" label="Until" value={toDate(settings.quietHoursEnd)} onChange={(d) => d && onChange({ quietHoursEnd: toHHMM(d) })} />
            </View>
          </View>
          <DateTimeField mode="time" label="Evening check-in" value={toDate(settings.checkinTime)} onChange={(d) => d && onChange({ checkinTime: toHHMM(d) })} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  title: {
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  body: {
    gap: 12,
  },
  item: {
    gap: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  forget: {
    alignSelf: 'flex-start',
  },
  pair: {
    flexDirection: 'row',
    gap: 12,
  },
});
