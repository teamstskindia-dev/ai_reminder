import { CircleCheck, ListChecks } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { useActionItemsInfinite } from '@/api/hooks/actionItems';
import { flattenPages } from '@/api/hooks/pagination';
import { Chip } from '@/components/ui/Chip';
import { GroupedItem } from '@/components/ui/GroupedItem';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';

import { ActionItemRow } from './ActionItemRow';
import { openActionItemEditor, useActionItemActions } from './useActionItemMenu';

type Filter = 'open' | 'done';

export function ActionItemsList() {
  const theme = useTheme();
  const [filter, setFilter] = useState<Filter>('open');
  const query = useActionItemsInfinite(filter);
  const actions = useActionItemActions();
  const refreshControl = useRefreshControl(() => query.refetch());
  const items = flattenPages(query.data);

  const empty = query.isPending ? (
    <SkeletonList count={5} lines={1} />
  ) : query.isError ? (
    <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
  ) : filter === 'open' ? (
    <EmptyState
      icon={CircleCheck}
      title="Nothing on your plate"
      message="Action items captured in your meetings show up here."
      action={{ label: 'Add action item', onPress: () => openActionItemEditor() }}
    />
  ) : (
    <EmptyState icon={ListChecks} title="No completed items yet" message="Checked-off action items are kept here." />
  );

  return (
    <View style={styles.flex}>
      <View style={styles.filters}>
        <Chip label="Open" size="md" selected={filter === 'open'} onPress={() => setFilter('open')} />
        <Chip label="Done" size="md" selected={filter === 'done'} onPress={() => setFilter('done')} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item, index }) => (
          <GroupedItem index={index} count={items.length}>
            <SwipeRow {...actions.swipeActions(item)}>
              <ActionItemRow item={item} onToggle={actions.onToggle} onPress={() => openActionItemEditor(item)} onMenu={actions.openMenu} />
            </SwipeRow>
          </GroupedItem>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={empty}
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={theme.colors.primary} style={styles.footer} /> : undefined}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={refreshControl}
      />
      {actions.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  filters: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
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
  footer: {
    marginVertical: 16,
  },
});
