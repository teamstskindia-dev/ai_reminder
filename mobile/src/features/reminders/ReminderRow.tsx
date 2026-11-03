import { Bell, EllipsisVertical, Mail, MessageSquare, Sparkles } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Reminder } from '@/api/types';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT_TARGET } from '@/theme/tokens';
import { formatDayLabel, formatTime } from '@/utils/format';

export interface ReminderRowProps {
  reminder: Reminder;
  onPress?: (reminder: Reminder) => void;
  onMenu?: (reminder: Reminder) => void;
  showDay?: boolean;
}

function ReminderRowBase({ reminder, onPress, onMenu, showDay = false }: ReminderRowProps) {
  const theme = useTheme();
  const subtitle = reminder.body || reminder.meetingTitle;
  const fromAi = reminder.source === 'ai';

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={`${reminder.title}, ${formatDayLabel(reminder.remindAt)} at ${formatTime(reminder.remindAt)}`}
      onPress={onPress ? () => onPress(reminder) : undefined}
      onLongPress={onMenu ? () => onMenu(reminder) : undefined}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: theme.colors.surfacePressed } : null]}
    >
      <View style={[styles.time, { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.md }]}>
        <Text variant="label" tone="brand" numberOfLines={1}>
          {formatTime(reminder.remindAt).replace(' ', ' ')}
        </Text>
        {showDay ? (
          <Text variant="micro" tone="brand" numberOfLines={1}>
            {formatDayLabel(reminder.remindAt)}
          </Text>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text variant="body" numberOfLines={2}>
          {reminder.title}
        </Text>
        <View style={styles.meta}>
          {fromAi ? <Sparkles size={12} color={theme.colors.accentText} /> : null}
          {subtitle ? (
            <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.flex}>
              {subtitle}
            </Text>
          ) : null}
          <View style={styles.channels}>
            {reminder.channels.includes('push') ? <Bell size={12} color={theme.colors.textMuted} /> : null}
            {reminder.channels.includes('in_app') ? <MessageSquare size={12} color={theme.colors.textMuted} /> : null}
            {reminder.channels.includes('email') ? <Mail size={12} color={theme.colors.textMuted} /> : null}
          </View>
        </View>
      </View>
      {onMenu ? (
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={`More actions for "${reminder.title}"`}
          rippleBorderless
          onPress={() => onMenu(reminder)}
          style={styles.more}
        >
          <EllipsisVertical size={18} color={theme.colors.textMuted} />
        </Touchable>
      ) : null}
    </Touchable>
  );
}

export const ReminderRow = memo(ReminderRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 10,
    minHeight: 64,
  },
  time: {
    minWidth: 72,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 2,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flex: {
    flexShrink: 1,
  },
  channels: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 'auto',
  },
  more: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
