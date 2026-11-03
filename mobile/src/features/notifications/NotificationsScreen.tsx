import { Stack } from 'expo-router';
import {
  AlarmClock,
  BellOff,
  CalendarClock,
  CheckCheck,
  FileText,
  ListChecks,
  Megaphone,
  Newspaper,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { memo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotificationsInfinite, useUnreadCount } from '@/api/hooks/notifications';
import { flattenPages } from '@/api/hooks/pagination';
import type { AppNotification, NotificationType } from '@/api/types';
import { Chip } from '@/components/ui/Chip';
import { GroupedItem } from '@/components/ui/GroupedItem';
import { IconButton } from '@/components/ui/IconButton';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { openNotificationTarget } from '@/features/push/routing';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { formatRelative } from '@/utils/format';

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  meeting_upcoming: CalendarClock,
  report_ready: FileText,
  action_item_due: ListChecks,
  reminder: AlarmClock,
  daily_digest: Newspaper,
  bot_failed: TriangleAlert,
  broadcast: Megaphone,
};

const NotificationRow = memo(function NotificationRow({
  notification,
  onPress,
}: {
  notification: AppNotification;
  onPress: (n: AppNotification) => void;
}) {
  const theme = useTheme();
  const unread = !notification.readAt;
  const Icon = TYPE_ICON[notification.type] ?? Megaphone;
  const danger = notification.type === 'bot_failed';
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${notification.title}`}
      onPress={() => onPress(notification)}
      style={[styles.row, unread ? { backgroundColor: theme.colors.primarySoft } : null]}
    >
      <View style={[styles.icon, { backgroundColor: danger ? theme.colors.dangerSoft : theme.colors.surfaceMuted }]}>
        <Icon size={18} color={danger ? theme.colors.danger : theme.colors.primaryText} />
      </View>
      <View style={styles.body}>
        <Text variant={unread ? 'bodyStrong' : 'body'} numberOfLines={2}>
          {notification.title}
        </Text>
        {notification.body ? (
          <Text variant="caption" tone="secondary" numberOfLines={2}>
            {notification.body}
          </Text>
        ) : null}
        <Text variant="caption" tone="muted">
          {formatRelative(notification.createdAt)}
        </Text>
      </View>
      {unread ? <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} /> : null}
    </Touchable>
  );
});

export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { isEnabled } = useConfig();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = useNotificationsInfinite(unreadOnly);
  const unread = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const refreshControl = useRefreshControl(() => Promise.all([query.refetch(), unread.refetch()]));
  const items = flattenPages(query.data);

  const open = (notification: AppNotification) => {
    if (!notification.readAt) markRead.mutate(notification);
    openNotificationTarget(notification.data, isEnabled, { fromNotificationsScreen: true });
  };

  const empty = query.isPending ? (
    <SkeletonList count={6} lines={1} />
  ) : query.isError ? (
    <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
  ) : (
    <EmptyState
      icon={BellOff}
      title={unreadOnly ? "You're all caught up" : 'No notifications yet'}
      message={unreadOnly ? 'No unread notifications.' : 'Meeting alerts, reports and reminders will show up here.'}
    />
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          headerRight: unread.data
            ? () => (
                <IconButton
                  icon={CheckCheck}
                  accessibilityLabel="Mark all as read"
                  onPress={() => markAll.mutate()}
                />
              )
            : undefined,
        }}
      />
      <View style={styles.filters}>
        <Chip label="All" size="md" selected={!unreadOnly} onPress={() => setUnreadOnly(false)} />
        <Chip label={unread.data ? `Unread · ${unread.data}` : 'Unread'} size="md" selected={unreadOnly} onPress={() => setUnreadOnly(true)} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        renderItem={({ item, index }) => (
          <GroupedItem index={index} count={items.length}>
            <NotificationRow notification={item} onPress={open} />
          </GroupedItem>
        )}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
        ListEmptyComponent={empty}
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={theme.colors.primary} style={styles.footer} /> : undefined}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={refreshControl}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  filters: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  list: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    minHeight: 64,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  footer: {
    marginVertical: 16,
  },
});
