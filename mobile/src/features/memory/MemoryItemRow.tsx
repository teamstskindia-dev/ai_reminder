import { router } from 'expo-router';
import { Mail, Mic, MoonStar, Video, type LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MemoryItem, MemoryKind } from '@/api/types';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { moodEmoji } from '@/features/companion/mood';
import { useTheme } from '@/theme/ThemeProvider';
import { formatTime } from '@/utils/format';

const KIND_ICON: Record<MemoryKind, LucideIcon> = {
  conversation: Mic,
  meeting: Video,
  checkin: MoonStar,
  email: Mail,
};

const KIND_LABEL: Record<MemoryKind, string> = {
  conversation: 'Conversation',
  meeting: 'Meeting',
  checkin: 'Check-in',
  email: 'Email',
};

/** Opens a memory: the recording, the meeting, the email; check-ins open the check-in screen. */
export function openMemory(item: MemoryItem): void {
  switch (item.kind) {
    case 'conversation':
      router.push({ pathname: '/capture/[id]', params: { id: item.id } });
      return;
    case 'meeting':
      router.push({ pathname: '/meeting/[id]', params: { id: item.id } });
      return;
    case 'email':
      router.push({ pathname: '/email/[id]', params: { id: item.id } });
      return;
    case 'checkin':
      return;
  }
}

function MemoryItemRowBase({ item, quote, showDate }: { item: MemoryItem; quote?: string | null; showDate?: boolean }) {
  const theme = useTheme();
  const Icon = KIND_ICON[item.kind];
  const opens = item.kind !== 'checkin';
  const when = showDate
    ? new Date(item.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : formatTime(item.at);
  return (
    <Touchable
      accessibilityRole={opens ? 'button' : undefined}
      accessibilityLabel={`${KIND_LABEL[item.kind]}: ${item.title}`}
      onPress={opens ? () => openMemory(item) : undefined}
      disabled={!opens}
      style={styles.row}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.md }]}>
        <Icon size={18} color={theme.colors.primaryText} />
      </View>
      <View style={styles.body}>
        <View style={styles.top}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {item.title}
          </Text>
          {item.mood ? <Text accessibilityLabel={`Mood ${item.mood} of 5`}>{moodEmoji(item.mood)}</Text> : null}
        </View>
        {quote || item.snippet ? (
          <Text variant="callout" tone="secondary" numberOfLines={item.kind === 'checkin' ? 4 : 2}>
            {quote ? `“${quote}”` : item.snippet}
          </Text>
        ) : null}
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {[KIND_LABEL[item.kind], when, item.people.length ? item.people.slice(0, 3).join(', ') : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Touchable>
  );
}

export const MemoryItemRow = memo(MemoryItemRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  icon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
});
