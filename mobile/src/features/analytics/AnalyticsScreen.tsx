import { ChartColumn, Clock, Hourglass, ListChecks, Video } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAnalytics } from '@/api/hooks/dashboard';
import type { AnalyticsRange } from '@/api/types';
import { FeatureGate } from '@/components/FeatureGate';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { formatDuration, formatMinutes } from '@/utils/format';

import { MeetingsBarChart } from './MeetingsBarChart';
import { SentimentSplit } from './SentimentSplit';

const RANGES = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
] as const;

function ScoreCell({ label, score, color }: { label: string; score: number | null; color?: string }) {
  return (
    <View style={styles.scoreCell}>
      <ScoreRing score={score} size={60} label={label} color={color} />
      <Text variant="caption" tone="secondary" align="center">
        {label}
      </Text>
    </View>
  );
}

function AnalyticsContent() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const query = useAnalytics(range);
  const refreshControl = useRefreshControl(() => query.refetch());
  const data = query.data;

  const renderBody = () => {
    if (query.isPending) {
      return (
        <View style={styles.sections}>
          <View style={styles.grid}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.tileSkeleton}>
                <Skeleton height={86} radius={14} />
              </View>
            ))}
          </View>
          <Skeleton height={220} radius={16} />
          <Skeleton height={120} radius={16} />
        </View>
      );
    }
    if (!data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
    const t = data.totals;
    if (t.meetings === 0) {
      return (
        <EmptyState
          icon={ChartColumn}
          title="No meetings in this period"
          message="Insights appear once the notetaker has joined a few of your meetings."
        />
      );
    }
    const completion = t.actionItemsCreated ? t.actionItemsCompleted / t.actionItemsCreated : 0;
    const maxTalk = Math.max(1, ...data.topParticipants.map((p) => p.talkTimeSeconds));

    return (
      <View style={[styles.sections, query.isPlaceholderData ? styles.stale : null]}>
        <View style={styles.grid}>
          <StatTile icon={Video} label="Meetings" value={String(t.meetings)} />
          <StatTile icon={Clock} label="Time in meetings" value={formatMinutes(t.totalMinutes)} tint={theme.colors.accentText} />
          <StatTile icon={Hourglass} label="Average length" value={formatMinutes(t.avgMeetingMinutes)} tint={theme.colors.info} />
          <StatTile
            icon={ListChecks}
            label="Action items done"
            value={`${t.actionItemsCompleted}/${t.actionItemsCreated}`}
            hint={t.actionItemsCreated ? `${Math.round(completion * 100)}% completed` : undefined}
            tint={theme.colors.warning}
          />
        </View>

        <Card>
          <Text variant="subheading">Scores</Text>
          <View style={styles.scores}>
            <ScoreCell label="Meeting" score={t.avgMeetingScore} />
            <ScoreCell label="Engagement" score={t.avgEngagementScore} color={theme.colors.accentText} />
            <ScoreCell label="Sentiment" score={t.avgSentimentScore} />
          </View>
        </Card>

        <Card>
          <Text variant="subheading">Meetings per day</Text>
          <View style={styles.chart}>
            <MeetingsBarChart days={data.byDay} />
          </View>
        </Card>

        <Card>
          <Text variant="subheading" style={styles.cardTitle}>
            Sentiment
          </Text>
          <SentimentSplit breakdown={data.sentimentBreakdown} />
        </Card>

        {data.topTopics.length ? (
          <Card>
            <Text variant="subheading" style={styles.cardTitle}>
              Top topics
            </Text>
            <View style={styles.chips}>
              {data.topTopics.map((topic) => (
                <Chip key={topic.topic} label={`${topic.topic} · ${topic.count}`} tone="brand" size="md" />
              ))}
            </View>
          </Card>
        ) : null}

        {data.topParticipants.length ? (
          <Card>
            <Text variant="subheading" style={styles.cardTitle}>
              Who you meet with
            </Text>
            <View style={styles.people}>
              {data.topParticipants.map((p) => (
                <View key={p.name} style={styles.person}>
                  <Avatar name={p.name} size={34} />
                  <View style={styles.flex}>
                    <View style={styles.personTop}>
                      <Text variant="body" numberOfLines={1} style={styles.flex}>
                        {p.name}
                      </Text>
                      <Text variant="caption" tone="secondary">
                        {p.meetings} mtgs · {formatDuration(p.talkTimeSeconds) ?? '0 min'}
                      </Text>
                    </View>
                    <ProgressBar value={p.talkTimeSeconds / maxTalk} color={theme.colors.accent} />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

      </View>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} refreshControl={refreshControl}>
      <SegmentedControl options={RANGES} value={range} onChange={setRange} />
      {renderBody()}
    </ScrollView>
  );
}

export function AnalyticsScreen() {
  return (
    <FeatureGate feature="analytics">
      <AnalyticsContent />
    </FeatureGate>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  sections: {
    gap: 16,
  },
  stale: {
    opacity: 0.6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tileSkeleton: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  scores: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 14,
  },
  scoreCell: {
    alignItems: 'center',
    gap: 6,
  },
  chart: {
    marginTop: 4,
  },
  cardTitle: {
    marginBottom: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  people: {
    gap: 14,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  personTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  flex: {
    flex: 1,
  },
});
