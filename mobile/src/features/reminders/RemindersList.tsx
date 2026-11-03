import { AlarmClock } from 'lucide-react-native';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';

import { flattenPages } from '@/api/hooks/pagination';
import { useRemindersInfinite } from '@/api/hooks/reminders';
import type { Reminder } from '@/api/types';
import { GroupedItem } from '@/components/ui/GroupedItem';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { formatDayLabel, toDate } from '@/utils/format';

import { ReminderRow } from './ReminderRow';
import { openReminderEditor, useReminderMenu } from './useReminderMenu';

interface DaySection {
  key: string;
  title: string;
  data: Reminder[];
}

/** Groups reminders by calendar day ("Today", "Tomorrow", "Friday", …) in remindAt order. */
export function groupByDay(reminders: Reminder[]): DaySection[] {
  const sorted = [...reminders].sort((a, b) => toDate(a.remindAt).getTime() - toDate(b.remindAt).getTime());
  const sections: DaySection[] = [];
  for (const reminder of sorted) {
    const d = toDate(reminder.remindAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const last = sections[sections.length - 1];
    if (last && last.key === key) last.data.push(reminder);
    else sections.push({ key, title: formatDayLabel(d), data: [reminder] });
  }
  return sections;
}

export function RemindersList() {
  const theme = useTheme();
  const query = useRemindersInfinite('pending');
  const menu = useReminderMenu();
  const refreshControl = useRefreshControl(() => query.refetch());
  const sections = groupByDay(flattenPages(query.data));

  const empty = query.isPending ? (
    <SkeletonList count={5} lines={1} />
  ) : query.isError ? (
    <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
  ) : (
    <EmptyState
      icon={AlarmClock}
      title="No reminders scheduled"
      message="Reminders from your meetings and the ones you create appear here."
      action={{ label: 'New reminder', onPress: () => openReminderEditor() }}
    />
  );

  return (
    <View style={styles.flex}>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        renderSectionHeader={({ section }) => (
          <Text variant="micro" tone="muted" style={[styles.sectionHeader, { backgroundColor: theme.colors.background }]}>
            {section.title.toUpperCase()}
          </Text>
        )}
        renderItem={({ item, index, section }) => (
          <GroupedItem index={index} count={section.data.length}>
            <SwipeRow {...menu.swipeActions(item)}>
              <ReminderRow reminder={item} onPress={() => openReminderEditor(item)} onMenu={menu.openMenu} />
            </SwipeRow>
          </GroupedItem>
        )}
        SectionSeparatorComponent={SectionGap}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.list}
        ListEmptyComponent={empty}
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={theme.colors.primary} style={styles.footer} /> : undefined}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={refreshControl}
      />
      {menu.sheet}
    </View>
  );
}

function SectionGap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  sectionHeader: {
    paddingTop: 12,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  gap: {
    height: 4,
  },
  footer: {
    marginVertical: 16,
  },
});
