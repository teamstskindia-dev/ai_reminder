import { EllipsisVertical, Flag } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ActionItem } from '@/api/types';
import { Checkbox } from '@/components/ui/Checkbox';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useNow } from '@/hooks/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT_TARGET } from '@/theme/tokens';
import { formatDayLabel, formatTime, toDate } from '@/utils/format';

export interface ActionItemRowProps {
  item: ActionItem;
  onToggle: (item: ActionItem) => void;
  onPress?: (item: ActionItem) => void;
  onMenu?: (item: ActionItem) => void;
  showMeeting?: boolean;
}

function dueLabel(dueAt: string): string {
  const date = toDate(dueAt);
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  return hasTime ? `${formatDayLabel(date)}, ${formatTime(date)}` : formatDayLabel(date);
}

function ActionItemRowBase({ item, onToggle, onPress, onMenu, showMeeting = true }: ActionItemRowProps) {
  const theme = useTheme();
  const now = useNow();
  const done = item.status === 'done';
  const overdue = !done && item.dueAt !== null && toDate(item.dueAt).getTime() < now;
  const meta: string[] = [];
  if (item.assigneeName && !item.isMine) meta.push(item.assigneeName);
  if (showMeeting && item.meetingTitle) meta.push(item.meetingTitle);

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress ? () => onPress(item) : undefined}
      onLongPress={onMenu ? () => onMenu(item) : undefined}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: theme.colors.surfacePressed } : null]}
    >
      <Checkbox checked={done} onToggle={() => onToggle(item)} accessibilityLabel={`Mark "${item.title}" as ${done ? 'open' : 'done'}`} />
      <View style={styles.body}>
        <Text
          variant="body"
          tone={done ? 'muted' : 'default'}
          numberOfLines={2}
          style={done ? styles.done : null}
        >
          {item.title}
        </Text>
        <View style={styles.metaRow}>
          {item.priority === 'high' && !done ? <Flag size={12} color={theme.colors.danger} fill={theme.colors.danger} /> : null}
          {item.dueAt ? (
            <Text variant="caption" tone={overdue ? 'danger' : 'secondary'}>
              {overdue ? 'Overdue · ' : 'Due '}
              {dueLabel(item.dueAt)}
            </Text>
          ) : null}
          {meta.length ? (
            <Text variant="caption" tone="muted" numberOfLines={1} style={styles.flex}>
              {item.dueAt ? ' · ' : ''}
              {meta.join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>
      {onMenu ? (
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={`More actions for "${item.title}"`}
          rippleBorderless
          onPress={() => onMenu(item)}
          style={styles.more}
        >
          <EllipsisVertical size={18} color={theme.colors.textMuted} />
        </Touchable>
      ) : null}
    </Touchable>
  );
}

export const ActionItemRow = memo(ActionItemRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 6,
    minHeight: 60,
  },
  body: {
    flex: 1,
    gap: 2,
    paddingVertical: 4,
  },
  done: {
    textDecorationLine: 'line-through',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flex: {
    flexShrink: 1,
  },
  more: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
