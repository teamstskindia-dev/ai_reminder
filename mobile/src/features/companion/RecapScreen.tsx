import { router, Stack } from 'expo-router';
import { CalendarCheck, HeartHandshake, Smile, Sparkles, Users } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRecaps } from '@/api/hooks/companion';
import type { WeeklyRecap } from '@/api/types';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { formatDayLabel } from '@/utils/format';

import { moodEmoji } from './mood';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function weekLabel(r: WeeklyRecap): string {
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(r.weekStart)} – ${fmt(r.weekEnd)}`;
}

function Section({ icon: Icon, title, children }: { icon: typeof Sparkles; title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Card>
      <View style={styles.sectionHead}>
        <Icon size={18} color={theme.colors.primaryText} />
        <Text variant="subheading">{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </Card>
  );
}

function RecapView({ recap }: { recap: WeeklyRecap }) {
  const theme = useTheme();
  const trend = recap.mood.trend === 'up' ? 'Up from last week' : recap.mood.trend === 'down' ? 'A bit lower than last week' : recap.mood.trend === 'flat' ? 'About the same as last week' : null;
  return (
    <View style={styles.sections}>
      <View style={styles.hero}>
        <Text variant="caption" tone="muted">
          {weekLabel(recap)}
        </Text>
        <Text variant="display">{recap.headline}</Text>
      </View>

      <Section icon={HeartHandshake} title="Promises kept">
        <Text variant="body">
          {recap.promises.kept} to-dos and {recap.promises.remindersDone} reminders done.
        </Text>
        <Text variant="caption" tone="secondary">
          {recap.promises.stillOpen ? `${recap.promises.stillOpen} still open.` : 'Nothing left open. 🙌'}
        </Text>
      </Section>

      <Section icon={Smile} title="Mood this week">
        <View style={styles.moodRow}>
          {recap.mood.days.map((d, i) => (
            <View key={d.date} style={styles.moodDay}>
              <Text variant="heading">{moodEmoji(d.mood)}</Text>
              <Text variant="micro" tone="muted">
                {WEEKDAYS[i]}
              </Text>
            </View>
          ))}
        </View>
        <Text variant="caption" tone="secondary">
          {recap.mood.average !== null ? `Average ${recap.mood.average}/5${trend ? ` · ${trend}` : ''}` : 'Do the evening check-in to see your mood here.'}
          {recap.mood.checkins ? ` · ${recap.mood.checkins} check-ins` : ''}
        </Text>
      </Section>

      {recap.meetings.count ? (
        <Section icon={CalendarCheck} title={`Meetings · ${recap.meetings.count} (${recap.meetings.hours}h)`}>
          <View>
            {recap.meetings.highlights.map((h) => (
              <Touchable key={h.id} accessibilityRole="button" onPress={() => router.push(`/meeting/${h.id}`)} style={[styles.highlight, { borderBottomColor: theme.colors.border }]}>
                <Text variant="callout" numberOfLines={1} style={styles.flex}>
                  {h.title}
                </Text>
                <Text variant="caption" tone="muted">
                  {formatDayLabel(h.startAt)}
                </Text>
              </Touchable>
            ))}
          </View>
        </Section>
      ) : null}

      {recap.people.length ? (
        <Section icon={Users} title="People you met">
          <View style={styles.chips}>
            {recap.people.map((p) => (
              <Chip key={p} label={p} />
            ))}
          </View>
        </Section>
      ) : null}
    </View>
  );
}

/** Weekly recap (user-flow §03): sent every Sunday evening; previous weeks are one tap away. */
export function RecapScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const recaps = useRecaps();
  const [index, setIndex] = useState(0);
  const refreshControl = useRefreshControl(() => recaps.refetch());
  const list = recaps.data ?? [];
  const current = list[Math.min(index, Math.max(0, list.length - 1))];

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: 'Weekly recap' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]} refreshControl={refreshControl}>
        {recaps.isPending ? (
          <>
            <Skeleton height={60} />
            <Skeleton height={120} radius={16} />
            <Skeleton height={120} radius={16} />
          </>
        ) : recaps.isError ? (
          <ErrorState error={recaps.error} onRetry={() => void recaps.refetch()} retrying={recaps.isFetching} />
        ) : !current ? (
          <EmptyState icon={Sparkles} title="Your first recap is coming" message="Every Sunday evening I'll sum up your week: highlights, promises kept, your mood and the people you met." />
        ) : (
          <>
            {list.length > 1 ? (
              <View style={styles.chips}>
                {list.map((r, i) => (
                  <Chip key={r.weekStart} label={weekLabel(r)} selected={i === index} onPress={() => setIndex(i)} />
                ))}
              </View>
            ) : null}
            <RecapView recap={current} />
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
  sections: {
    gap: 12,
  },
  hero: {
    gap: 4,
    paddingHorizontal: 4,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionBody: {
    marginTop: 10,
    gap: 6,
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  moodDay: {
    alignItems: 'center',
    gap: 2,
  },
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
});
