import { memo } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';

import type { TranscriptSegment } from '@/api/types';
import { Text } from '@/components/ui/Text';
import { useTheme, type AppTheme } from '@/theme/ThemeProvider';
import { formatTimestamp } from '@/utils/format';

function speakerColor(theme: AppTheme, speaker: string): string {
  const palette = [
    theme.colors.primaryText,
    theme.colors.accentText,
    theme.colors.info,
    theme.colors.warning,
    theme.colors.success,
    theme.colors.danger,
  ];
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) hash = (hash * 31 + speaker.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const theme = useTheme();
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <RNText key={i} style={[styles.mark, { backgroundColor: theme.colors.warningSoft, color: theme.colors.text }]}>
            {part}
          </RNText>
        ) : (
          part
        ),
      )}
    </>
  );
}

function TranscriptItemBase({ segment, query }: { segment: TranscriptSegment; query: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Text variant="label" color={speakerColor(theme, segment.speaker)} numberOfLines={1} style={styles.speaker}>
          {segment.speaker}
        </Text>
        <Text variant="caption" tone="muted">
          {formatTimestamp(segment.startMs)}
        </Text>
      </View>
      <Text variant="body">
        <Highlighted text={segment.text} query={query} />
      </Text>
    </View>
  );
}

export const TranscriptItem = memo(TranscriptItemBase);

const styles = StyleSheet.create({
  row: {
    paddingVertical: 10,
    gap: 4,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  speaker: {
    flexShrink: 1,
  },
  mark: {
    fontWeight: '700',
  },
});
