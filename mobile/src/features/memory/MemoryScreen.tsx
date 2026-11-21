import { router } from 'expo-router';
import { Brain, ChevronRight, Search, SearchX, UserPlus, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, SectionList, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useCreatePerson, useMemorySearch, useMemoryTimeline, usePeople } from '@/api/hooks/memory';
import type { MemoryItem, PersonListItem } from '@/api/types';
import { TabHeader } from '@/components/layout/TabHeader';
import { Avatar } from '@/components/ui/Avatar';
import { GroupedItem } from '@/components/ui/GroupedItem';
import { IconButton } from '@/components/ui/IconButton';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Touchable } from '@/components/ui/Touchable';
import { useTabLabel } from '@/features/navigation/tabs';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { formatDayLabel, formatRelative } from '@/utils/format';
import { toast } from '@/utils/toast';

import { MemoryItemRow } from './MemoryItemRow';

type Segment = 'timeline' | 'people';
const SEGMENTS = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'people', label: 'People' },
] as const;

/**
 * Memory (user-flow §10): everything the friend remembers by day, the people in the user's life, and
 * search by meaning ("when was I worried about money?").
 */
export function MemoryScreen() {
  const theme = useTheme();
  const title = useTabLabel('memory', 'Memory');
  const [segment, setSegment] = useState<Segment>('timeline');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const q = useDebouncedValue(search.trim(), 400);
  const create = useCreatePerson();
  const searching = segment === 'timeline' && q.length >= 2;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <TabHeader
        title={title}
        right={
          segment === 'people' ? (
            <IconButton icon={UserPlus} variant="tonal" accessibilityLabel="Add a person" onPress={() => setAdding(true)} />
          ) : undefined
        }
      >
        <SegmentedControl options={SEGMENTS} value={segment} onChange={setSegment} />
        <TextField
          icon={Search}
          placeholder={segment === 'people' ? 'Find a person' : 'Search by meaning, e.g. “when was I worried about money?”'}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel={segment === 'people' ? 'Find a person' : 'Search memory'}
        />
      </TabHeader>

      {segment === 'people' ? <PeopleList q={q} /> : searching ? <SearchResults q={q} /> : <Timeline />}

      <PromptDialog
        visible={adding}
        title="Add a person"
        message="I’ll keep their card: how you know them, what you promised each other and key facts."
        initialValue=""
        placeholder="Name"
        maxLength={120}
        confirmLabel="Add"
        onCancel={() => setAdding(false)}
        onSubmit={(value) => {
          setAdding(false);
          const name = value.trim();
          if (!name) return;
          create.mutate(
            { name },
            {
              onSuccess: (p) => router.push({ pathname: '/person/[id]', params: { id: p.id } }),
              onError: (e) => toast(getErrorMessage(e)),
            },
          );
        }}
      />
    </View>
  );
}

function Timeline() {
  const theme = useTheme();
  const query = useMemoryTimeline();
  const refreshControl = useRefreshControl(() => query.refetch());
  const sections = useMemo(() => {
    const byDate = new Map<string, MemoryItem[]>();
    for (const page of query.data?.pages ?? []) {
      for (const day of page.days) byDate.set(day.date, [...(byDate.get(day.date) ?? []), ...day.items]);
    }
    return [...byDate.entries()].map(([date, data]) => ({ date, data }));
  }, [query.data]);

  if (query.isPending) return <View style={styles.list}>
        <SkeletonList count={5} />
      </View>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => `${item.kind}-${item.id}`}
      renderSectionHeader={({ section }) => (
        <Text variant="micro" tone="muted" style={styles.dayHeader}>
          {formatDayLabel(`${section.date}T12:00:00`).toUpperCase()}
        </Text>
      )}
      renderItem={({ item, index, section }) => (
        <GroupedItem index={index} count={section.data.length}>
          <MemoryItemRow item={item} />
        </GroupedItem>
      )}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <EmptyState
          icon={Brain}
          title="Nothing remembered yet"
          message="Record a conversation, do an evening check-in or connect your email. Everything shows up here by day."
        />
      }
      ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={theme.colors.primary} style={styles.footer} /> : undefined}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    />
  );
}

function SearchResults({ q }: { q: string }) {
  const theme = useTheme();
  const query = useMemorySearch(q);
  if (query.isPending) {
    return (
      <View style={styles.searching}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text variant="callout" tone="secondary">
          Looking through your memories…
        </Text>
      </View>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  const { results, related } = query.data;
  if (!results.length) {
    return (
      <FlatList
        data={related}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        ListHeaderComponent={
          <View style={styles.noMatch}>
            <EmptyState
              compact
              icon={SearchX}
              title="I don’t remember anything about that"
              message={related.length ? `Nothing matched “${q}”. Maybe one of these?` : `Nothing matched “${q}”.`}
            />
          </View>
        }
        renderItem={({ item, index }) => (
          <GroupedItem index={index} count={related.length}>
            <MemoryItemRow item={item} showDate />
          </GroupedItem>
        )}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    );
  }
  return (
    <FlatList
      data={results}
      keyExtractor={(r) => `${r.item.kind}-${r.item.id}`}
      ListHeaderComponent={
        <Text variant="micro" tone="muted" style={styles.dayHeader}>
          {`${results.length} ${results.length === 1 ? 'MEMORY' : 'MEMORIES'}`}
        </Text>
      }
      renderItem={({ item, index }) => (
        <GroupedItem index={index} count={results.length}>
          <MemoryItemRow item={item.item} quote={item.quote} showDate />
        </GroupedItem>
      )}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    />
  );
}

function PeopleList({ q }: { q: string }) {
  const people = usePeople(q);
  const refreshControl = useRefreshControl(() => people.refetch());
  if (people.isPending) return <View style={styles.list}>
        <SkeletonList count={5} />
      </View>;
  if (people.isError) return <ErrorState error={people.error} onRetry={() => void people.refetch()} retrying={people.isFetching} />;
  const list = people.data;
  return (
    <FlatList
      data={list}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={list.length ? <SectionHeader title="People" subtitle="Most recent first" style={styles.peopleHeader} /> : undefined}
      renderItem={({ item, index }) => (
        <GroupedItem index={index} count={list.length}>
          <PersonRow person={item} />
        </GroupedItem>
      )}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <EmptyState
          icon={Users}
          title={q ? 'No one by that name' : 'No people yet'}
          message={
            q ? `Nobody matches “${q}”.` : 'People you talk about or meet in recorded conversations get a card here.'
          }
        />
      }
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    />
  );
}

function PersonRow({ person }: { person: PersonListItem }) {
  const theme = useTheme();
  const meta = [
    person.relationship,
    person.lastTalkedAt ? `talked ${formatRelative(person.lastTalkedAt)}` : null,
    person.openPromises ? `${person.openPromises} open ${person.openPromises === 1 ? 'promise' : 'promises'}` : null,
  ].filter(Boolean);
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={person.name}
      onPress={() => router.push({ pathname: '/person/[id]', params: { id: person.id } })}
      style={styles.personRow}
    >
      <Avatar name={person.name} size={40} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {person.name}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {meta.length ? meta.join(' · ') : `${person.conversationCount} conversations`}
        </Text>
      </View>
      <ChevronRight size={18} color={theme.colors.textMuted} />
    </Touchable>
  );
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
    paddingBottom: 140,
  },
  dayHeader: {
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 8,
  },
  footer: {
    marginVertical: 16,
  },
  searching: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 48,
  },
  noMatch: {
    marginBottom: 12,
  },
  peopleHeader: {
    marginBottom: 8,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
});
