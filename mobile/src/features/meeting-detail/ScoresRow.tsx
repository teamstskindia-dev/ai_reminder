import { StyleSheet, View } from 'react-native';

import type { MeetingReport } from '@/api/types';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { Text } from '@/components/ui/Text';
import { sentimentText } from '@/features/meetings/status';
import { useTheme } from '@/theme/ThemeProvider';

function ScoreBlock({ label, score, caption, color }: { label: string; score: number | null; caption?: string; color?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.block, { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }, theme.elevation.card]}>
      <ScoreRing score={score} size={64} label={label} color={color} />
      <Text variant="label" align="center" numberOfLines={1}>
        {label}
      </Text>
      {caption ? (
        <Text variant="caption" tone="secondary" align="center" numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** Meeting / engagement / sentiment scores. */
export function ScoresRow({ report }: { report: MeetingReport }) {
  const theme = useTheme();
  const sentimentColor =
    report.sentimentLabel === 'positive'
      ? theme.colors.success
      : report.sentimentLabel === 'negative'
        ? theme.colors.danger
        : theme.colors.textSecondary;
  return (
    <View style={styles.row}>
      <ScoreBlock label="Meeting" score={report.meetingScore} caption="Overall" />
      <ScoreBlock label="Engagement" score={report.engagementScore} caption="Participation" color={theme.colors.accentText} />
      <ScoreBlock label="Sentiment" score={report.sentimentScore} caption={sentimentText(report.sentimentLabel)} color={sentimentColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  block: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    gap: 6,
  },
});
