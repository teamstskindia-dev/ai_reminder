import { router } from 'expo-router';
import { CircleAlert, RotateCcw, Video } from 'lucide-react-native';
import { memo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import type { AssistantSource } from '@/api/types';
import { Markdown } from '@/components/markdown/Markdown';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDayLabel } from '@/utils/format';

export interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: AssistantSource[];
  status?: 'thinking' | 'failed';
  error?: string;
}

function SourceCard({ source, index }: { source: AssistantSource; index: number }) {
  const theme = useTheme();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={`Source ${index + 1}: ${source.meetingTitle}`}
      onPress={() => router.push(`/meeting/${source.meetingId}`)}
      style={({ pressed }) => [
        styles.source,
        {
          backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
        },
      ]}
    >
      <View style={styles.sourceHead}>
        <View style={[styles.sourceIndex, { backgroundColor: theme.colors.primarySoft }]}>
          <Text variant="micro" tone="brand">
            {index + 1}
          </Text>
        </View>
        <Video size={14} color={theme.colors.textSecondary} />
        <Text variant="label" numberOfLines={1} style={styles.flex}>
          {source.meetingTitle}
        </Text>
      </View>
      <Text variant="caption" tone="muted">
        {formatDayLabel(source.startAt)}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={3}>
        {source.snippet}
      </Text>
    </Touchable>
  );
}

function ChatMessageBase({ item, onRetry }: { item: ChatItem; onRetry?: (item: ChatItem) => void }) {
  const theme = useTheme();

  if (item.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={[styles.userBubble, { backgroundColor: theme.colors.primary, borderRadius: theme.radii.lg }]}>
          <Text variant="body" color={theme.colors.primaryForeground}>
            {item.content}
          </Text>
        </View>
        {item.status === 'failed' ? (
          <View style={styles.failed}>
            <CircleAlert size={14} color={theme.colors.danger} />
            <Text variant="caption" tone="danger" style={styles.flexShrink}>
              {item.error ?? 'Not sent.'}
            </Text>
            {onRetry ? (
              <Touchable accessibilityRole="button" accessibilityLabel="Retry question" onPress={() => onRetry(item)} hitSlop={12} style={styles.retry}>
                <RotateCcw size={14} color={theme.colors.primaryText} />
                <Text variant="label" tone="brand">
                  Retry
                </Text>
              </Touchable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  if (item.status === 'thinking') {
    return (
      <View style={[styles.assistantBubble, styles.thinking, { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }]}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text variant="callout" tone="secondary">
          Searching your meetings…
        </Text>
      </View>
    );
  }

  const openSource = (n: number) => {
    const source = item.sources[n - 1];
    if (source) router.push(`/meeting/${source.meetingId}`);
  };

  return (
    <View style={styles.assistantRow}>
      <View style={[styles.assistantBubble, { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }, theme.elevation.card]}>
        <Markdown onCitationPress={item.sources.length ? openSource : undefined}>{item.content}</Markdown>
      </View>
      {item.sources.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sources}>
          {item.sources.map((source, i) => (
            <SourceCard key={`${source.meetingId}-${i}`} source={source} index={i} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

export const ChatMessage = memo(ChatMessageBase);

const styles = StyleSheet.create({
  userRow: {
    alignItems: 'flex-end',
    gap: 6,
  },
  userBubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomRightRadius: 4,
  },
  failed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '85%',
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4,
  },
  assistantRow: {
    gap: 8,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomLeftRadius: 4,
  },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sources: {
    gap: 8,
    paddingRight: 16,
  },
  source: {
    overflow: 'hidden',
    width: 220,
    padding: 12,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sourceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceIndex: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
});
