import { router } from 'expo-router';
import { AlarmClock, BellOff, Clock, Pencil, Sun, Trash } from 'lucide-react-native';
import { useState } from 'react';
import { Alert } from 'react-native';

import { useCancelReminder, useDeleteReminder, useSnoozeReminder, type SnoozeChoice } from '@/api/hooks/reminders';
import type { Reminder } from '@/api/types';
import { ActionSheet, type ActionSheetOption } from '@/components/ui/ActionSheet';
import type { SwipeAction } from '@/components/ui/SwipeRow';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDayLabel, formatTime, tomorrowAt } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { toast } from '@/utils/toast';

export function openReminderEditor(reminder?: Reminder) {
  router.push({ pathname: '/reminder/edit', params: { id: reminder?.id } });
}

/** Long-press / overflow menu for reminders: snooze, edit, cancel, delete. */
export function useReminderMenu() {
  const theme = useTheme();
  const snooze = useSnoozeReminder();
  const cancel = useCancelReminder();
  const remove = useDeleteReminder();
  const [target, setTarget] = useState<Reminder | null>(null);

  const doSnooze = (reminder: Reminder, choice: SnoozeChoice, label: string) => {
    haptics.success();
    snooze.mutate({ reminder, choice }, { onSuccess: () => toast(`Snoozed ${label}`) });
  };

  const confirm = (reminder: Reminder, kind: 'cancel' | 'delete') => {
    const isDelete = kind === 'delete';
    Alert.alert(isDelete ? 'Delete reminder?' : 'Cancel reminder?', `"${reminder.title}"`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: isDelete ? 'Delete' : 'Cancel reminder',
        style: 'destructive',
        onPress: () => (isDelete ? remove : cancel).mutate(reminder),
      },
    ]);
  };

  const tomorrow = tomorrowAt(9);
  const options: ActionSheetOption[] = target
    ? [
        { key: 's15', label: 'Snooze 15 minutes', icon: Clock, onPress: () => doSnooze(target, { kind: 'minutes', minutes: 15 }, 'for 15 minutes') },
        { key: 's60', label: 'Snooze 1 hour', icon: AlarmClock, onPress: () => doSnooze(target, { kind: 'minutes', minutes: 60 }, 'for 1 hour') },
        {
          key: 'tomorrow',
          label: `${formatDayLabel(tomorrow)}, ${formatTime(tomorrow)}`,
          icon: Sun,
          onPress: () => doSnooze(target, { kind: 'until', date: tomorrowAt(9) }, 'until tomorrow morning'),
        },
        { key: 'edit', label: 'Edit', icon: Pencil, onPress: () => openReminderEditor(target) },
        { key: 'cancel', label: 'Cancel reminder', icon: BellOff, onPress: () => confirm(target, 'cancel') },
        { key: 'delete', label: 'Delete', icon: Trash, destructive: true, onPress: () => confirm(target, 'delete') },
      ]
    : [];

  const sheet = (
    <ActionSheet
      visible={target !== null}
      title={target?.title}
      message={target ? `${formatDayLabel(target.remindAt)} at ${formatTime(target.remindAt)}` : undefined}
      options={options}
      onClose={() => setTarget(null)}
    />
  );

  /** Swipe left for "Snooze 1h" and "Delete". */
  const swipeActions = (reminder: Reminder): { right: SwipeAction[] } => ({
    right: [
      {
        key: 'snooze',
        label: 'Snooze 1h',
        icon: AlarmClock,
        color: theme.colors.warning,
        onPress: () => doSnooze(reminder, { kind: 'minutes', minutes: 60 }, 'for 1 hour'),
      },
      { key: 'delete', label: 'Delete', icon: Trash, color: theme.colors.danger, onPress: () => confirm(reminder, 'delete') },
    ],
  });

  return { openMenu: setTarget, swipeActions, sheet };
}
