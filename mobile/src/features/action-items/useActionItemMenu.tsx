import { router } from 'expo-router';
import { AlarmClock, CircleCheck, Circle, Pencil, Trash, Video } from 'lucide-react-native';
import { useState } from 'react';
import { Alert } from 'react-native';

import { useDeleteActionItem, useToggleActionItem } from '@/api/hooks/actionItems';
import type { ActionItem } from '@/api/types';
import { ActionSheet, type ActionSheetOption } from '@/components/ui/ActionSheet';
import type { SwipeAction } from '@/components/ui/SwipeRow';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';

export function openReminderFor(item: ActionItem) {
  const inOneHour = new Date(Date.now() + 60 * 60_000);
  const due = item.dueAt ? new Date(item.dueAt) : null;
  const remindAt = due && due.getTime() > Date.now() ? due : inOneHour;
  router.push({
    pathname: '/reminder/edit',
    params: {
      title: item.title,
      actionItemId: item.id,
      meetingId: item.meetingId ?? undefined,
      remindAt: remindAt.toISOString(),
    },
  });
}

export function openActionItemEditor(item?: ActionItem, meetingId?: string) {
  router.push({ pathname: '/action-item/edit', params: { id: item?.id, meetingId: meetingId ?? item?.meetingId ?? undefined } });
}

/** Toggle + long-press menu for action items, shared by Home, Reminders and Meeting detail. */
export function useActionItemActions() {
  const { isEnabled } = useConfig();
  const theme = useTheme();
  const toggle = useToggleActionItem();
  const remove = useDeleteActionItem();
  const [menuItem, setMenuItem] = useState<ActionItem | null>(null);

  const onToggle = (item: ActionItem) => {
    const done = item.status !== 'done';
    if (done) haptics.success();
    else haptics.selection();
    toggle.mutate({ item, done });
  };

  const confirmDelete = (item: ActionItem) => {
    Alert.alert('Delete action item?', `"${item.title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove.mutate(item),
      },
    ]);
  };

  const options: ActionSheetOption[] = menuItem
    ? [
        {
          key: 'toggle',
          label: menuItem.status === 'done' ? 'Mark as open' : 'Mark as done',
          icon: menuItem.status === 'done' ? Circle : CircleCheck,
          onPress: () => onToggle(menuItem),
        },
        { key: 'edit', label: 'Edit', icon: Pencil, onPress: () => openActionItemEditor(menuItem) },
        ...(isEnabled('reminders') && menuItem.status !== 'done'
          ? [{ key: 'remind', label: 'Remind me', icon: AlarmClock, onPress: () => openReminderFor(menuItem) }]
          : []),
        ...(menuItem.meetingId
          ? [{ key: 'meeting', label: 'Open meeting', icon: Video, onPress: () => router.push(`/meeting/${menuItem.meetingId}`) }]
          : []),
        { key: 'delete', label: 'Delete', icon: Trash, destructive: true, onPress: () => confirmDelete(menuItem) },
      ]
    : [];

  const sheet = (
    <ActionSheet
      visible={menuItem !== null}
      title={menuItem?.title}
      message={menuItem?.meetingTitle ?? undefined}
      options={options}
      onClose={() => setMenuItem(null)}
    />
  );

  /** Swipe right to complete / reopen, swipe left to delete. */
  const swipeActions = (item: ActionItem): { left: SwipeAction[]; right: SwipeAction[] } => ({
    left: [
      {
        key: 'toggle',
        label: item.status === 'done' ? 'Reopen' : 'Done',
        icon: item.status === 'done' ? Circle : CircleCheck,
        color: theme.colors.success,
        onPress: () => onToggle(item),
      },
    ],
    right: [{ key: 'delete', label: 'Delete', icon: Trash, color: theme.colors.danger, onPress: () => confirmDelete(item) }],
  });

  return { onToggle, openMenu: setMenuItem, swipeActions, sheet };
}
