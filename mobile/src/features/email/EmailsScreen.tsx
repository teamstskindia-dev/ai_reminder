import { router, Stack } from 'expo-router';
import { Inbox, RefreshCw } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEmailsInfinite, useSyncEmails } from '@/api/hooks/emails';
import { flattenPages } from '@/api/hooks/pagination';
import type { EmailFilter, EmailItem } from '@/api/types';
import { GroupedItem } from '@/components/ui/GroupedItem';
import { IconButton } from '@/components/ui/IconButton';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { toast } from '@/utils/toast';

import { EmailRow } from './EmailRow';

const FILTERS = [
  { value: 'important', label: 'Important' },
  { value: 'needs_reply', label: 'Reply' },
  { value: 'fyi', label: 'FYI' },
  { value: 'all', label: 'All' },
] as const;

const EMPTY: Record<EmailFilter, string> = {
  important: 'Nothing urgent. I’ll tell you when something important arrives.',
  needs_reply: 'No one is waiting for an answer.',
  fyi: 'No updates or newsletters lately.',
  all: 'No emails yet. New ones show up within a few minutes.',
};

/** Emails the friend read, sorted the way it alerts (user-flow §07). */
export function EmailsScreen({ initialFilter = 'important' }: { initialFilter?: EmailFilter }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<EmailFilter>(initialFilter);
  const emails = useEmailsInfinite(filter);
  const sync = useSyncEmails();
  const items = flattenPages(emails.data);
  const refreshControl = useRefreshControl(() => emails.refetch());
  const open = useCallback((e: EmailItem) => router.push({ pathname: '/email/[id]', params: { id: e.id } }), []);

  const checkNow = () =>
    sync.mutate(undefined, { onSuccess: () => toast('Checking your inbox. New emails appear in a moment.') });

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton icon={RefreshCw} accessibilityLabel="Check the inbox now" onPress={checkNow} disabled={sync.isPending} />
          ),
        }}
      />
      <View style={styles.filters}>
        <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      {emails.isPending ? (
        <View style={styles.pad}>
          <SkeletonList count={6} />
        </View>
      ) : emails.isError && !items.length ? (
        <ErrorState error={emails.error} onRetry={() => void emails.refetch()} retrying={emails.isFetching} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={refreshControl}
          renderItem={({ item, index }) => (
            <GroupedItem index={index} count={items.length}>
              <EmailRow email={item} onPress={open} />
            </GroupedItem>
          )}
          onEndReached={() => {
            if (emails.hasNextPage && !emails.isFetchingNextPage) void emails.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyState icon={Inbox} title="All clear" message={EMPTY[filter]} />}
          ListFooterComponent={emails.isFetchingNextPage ? <ActivityIndicator style={styles.pad} color={theme.colors.primary} /> : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  filters: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  list: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingHorizontal: 16 },
  pad: { padding: 16 },
});
