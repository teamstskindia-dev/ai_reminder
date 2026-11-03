import { StyleSheet, View } from 'react-native';

import type { AnalyticsOverview } from '@/api/types';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

/** Positive / neutral / negative as one segmented bar (diverging: two poles + neutral gray), labelled. */
export function SentimentSplit({ breakdown }: { breakdown: AnalyticsOverview['sentimentBreakdown'] }) {
  const theme = useTheme();
  const total = breakdown.positive + breakdown.neutral + breakdown.negative;
  const segments = [
    { key: 'positive', label: 'Positive', value: breakdown.positive, color: theme.colors.success },
    { key: 'neutral', label: 'Neutral', value: breakdown.neutral, color: theme.colors.textMuted },
    { key: 'negative', label: 'Negative', value: breakdown.negative, color: theme.colors.danger },
  ];
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);

  if (!total) {
    return (
      <Text variant="callout" tone="secondary">
        Sentiment appears once meetings have been analysed.
      </Text>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`Sentiment: ${segments.map((s) => `${s.label} ${pct(s.value)}%`).join(', ')}`}
      style={styles.wrap}
    >
      <View style={styles.bar}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <View key={s.key} style={{ flex: s.value, backgroundColor: s.color, borderRadius: 4 }} />
          ))}
      </View>
      <View style={styles.legend}>
        {segments.map((s) => (
          <View key={s.key} style={styles.item}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text variant="caption" tone="secondary">
              {s.label}
            </Text>
            <Text variant="label">{pct(s.value)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  bar: {
    flexDirection: 'row',
    height: 12,
    gap: 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
});
