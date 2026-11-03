import { router, useLocalSearchParams } from 'expo-router';
import { CalendarPlus, History, Plus, Search, SearchX } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { useMeetingsInfinite, useToggleAutoJoin } from '@/api/hooks/meetings';
import { flattenPages } from '@/api/hooks/pagination';
import type { MeetingListItem } from '@/api/types';
import { TabHeader } from '@/components/layout/TabHeader';
import { IconButton } from '@/components/ui/IconButton';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { TextField } from '@/components/ui/TextField';
import { useTabLabel } from '@/features/navigation/tabs';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';

import { MeetingCard } from './MeetingCard';

type Scope = 'upcoming' | 'past';

const SCOPES = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
] as const;

export function MeetingsScreen() {
  const theme = useTheme();
  const title = useTabLabel('meetings', 'Meetings');
  const params = useLocalSearchParams<{ scope?: string }>();
  // The route param drives the segment so links like /meetings?scope=past work while the tab is mounted.
  const scope: Scope = params.scope === 'past' ? 'past' : 'upcoming';
  const setScope = (value: Scope) => router.setParams({ scope: value });
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 350);
  const query = useMeetingsInfinite({ scope, q });
  const toggleAutoJoin = useToggleAutoJoin();
  const refreshControl = useRefreshControl(() => query.refetch());
  const meetings = flattenPages(query.data);

  const onToggleAutoJoin = (meeting: MeetingListItem, value: boolean) => {
    toggleAutoJoin.mutate(
      { id: meeting.id, autoJoin: value },
    );
  };

  const renderEmpty = () => {
    if (query.isPending) return <SkeletonList count={4} />;
    if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
    if (q) return <EmptyState icon={SearchX} title="No matches" message={`Nothing found for "${q}".`} />;
    return scope === 'upcoming' ? (
      <EmptyState
        icon={CalendarPlus}
        title="No upcoming meetings"
        message="Meetings with a Google Meet link on your calendar appear here automatically."
        action={{ label: 'Add a meeting', onPress: () => router.push('/meeting/new') }}
      />
    ) : (
      <EmptyState icon={History} title="No past meetings yet" message="Reports from meetings the notetaker joined will show up here." />
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <TabHeader
        title={title}
        right={<IconButton icon={Plus} variant="tonal" accessibilityLabel="Add a meeting" onPress={() => router.push('/meeting/new')} />}
      >
        <SegmentedControl options={SCOPES} value={scope} onChange={setScope} />
        <TextField
          icon={Search}
          placeholder="Search meetings"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search meetings"
        />
      </TabHeader>

      <FlatList
        data={meetings}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MeetingCard meeting={item} onToggleAutoJoin={scope === 'upcoming' ? onToggleAutoJoin : undefined} />
        )}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={renderEmpty()}
        ListFooterComponent={
          query.isFetchingNextPage ? <ActivityIndicator color={theme.colors.primary} style={styles.footer} /> : undefined
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  separator: {
    height: 12,
  },
  footer: {
    marginVertical: 16,
  },
});
