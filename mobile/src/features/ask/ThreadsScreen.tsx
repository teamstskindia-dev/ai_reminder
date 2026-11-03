import { router } from 'expo-router';
import { MessagesSquare, Trash } from 'lucide-react-native';
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDeleteThread, useThreadsInfinite } from '@/api/hooks/assistant';
import { flattenPages } from '@/api/hooks/pagination';
import type { AssistantThread } from '@/api/types';
import { FeatureGate } from '@/components/FeatureGate';
import { GroupedItem } from '@/components/ui/GroupedItem';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT_TARGET, MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { formatRelative } from '@/utils/format';

function ThreadsContent() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const query = useThreadsInfinite();
  const remove = useDeleteThread();
  const refreshControl = useRefreshControl(() => query.refetch());
  const threads = flattenPages(query.data);

  const open = (thread: AssistantThread) => router.navigate({ pathname: '/ask', params: { threadId: thread.id } });

  const confirmDelete = (thread: AssistantThread) => {
    Alert.alert('Delete conversation?', `"${thread.title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove.mutate(thread.id),
      },
    ]);
  };

  const empty = query.isPending ? (
    <SkeletonList count={6} lines={1} />
  ) : query.isError ? (
    <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
  ) : (
    <EmptyState
      icon={MessagesSquare}
      title="No conversations yet"
      message="Questions you ask are saved here so you can pick them up later."
      action={{ label: 'Ask a question', onPress: () => router.navigate('/ask') }}
    />
  );

  return (
    <FlatList
      style={{ backgroundColor: theme.colors.background }}
      data={threads}
      keyExtractor={(t) => t.id}
      renderItem={({ item, index }) => (
        <GroupedItem index={index} count={threads.length}>
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={`Open conversation ${item.title}`}
            onPress={() => open(item)}
            onLongPress={() => confirmDelete(item)}
            style={styles.row}
          >
            <View style={[styles.icon, { backgroundColor: theme.colors.primarySoft }]}>
              <MessagesSquare size={18} color={theme.colors.primaryText} />
            </View>
            <View style={styles.body}>
              <Text variant="body" numberOfLines={2}>
                {item.title || 'Untitled conversation'}
              </Text>
              <Text variant="caption" tone="muted">
                {formatRelative(item.updatedAt)}
              </Text>
            </View>
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={`Delete conversation ${item.title}`}
              rippleBorderless
              onPress={() => confirmDelete(item)}
              style={styles.delete}
            >
              <Trash size={18} color={theme.colors.textMuted} />
            </Touchable>
          </Touchable>
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
  );
}

export function ThreadsScreen() {
  return (
    <FeatureGate feature="askAi">
      <ThreadsContent />
    </FeatureGate>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 10,
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
  delete: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    marginVertical: 16,
  },
});
