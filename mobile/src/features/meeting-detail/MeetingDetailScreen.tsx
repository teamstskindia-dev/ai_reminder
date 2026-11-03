import { router, Stack, useLocalSearchParams } from 'expo-router';
import { EllipsisVertical, ExternalLink, FileSearch, ListChecks, LogOut, Plus, RefreshCw, Search, Send, Trash } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, FlatList, Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiError } from '@/api/errors';
import { useBotControl, useDeleteMeeting, useMeeting, useReprocessMeeting, useToggleAutoJoin, useTranscript } from '@/api/hooks/meetings';
import type { MeetingDetail, TranscriptSegment } from '@/api/types';
import { ActionSheet, type ActionSheetOption } from '@/components/ui/ActionSheet';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { ListGroup } from '@/components/ui/ListRow';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { ActionItemRow } from '@/features/action-items/ActionItemRow';
import { openActionItemEditor, useActionItemActions } from '@/features/action-items/useActionItemMenu';
import { canRecallBot, canSendBot } from '@/features/meetings/status';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { pluralize } from '@/utils/format';
import { toast } from '@/utils/toast';

import { MeetingHeader } from './MeetingHeader';
import { PeopleTab } from './PeopleTab';
import { ScoresRow } from './ScoresRow';
import { SummaryTab } from './SummaryTab';
import { TranscriptItem } from './TranscriptItem';

type Segment = 'summary' | 'actions' | 'transcript' | 'people';

function DetailSkeleton() {
  return (
    <View style={styles.skeleton}>
      <Skeleton width="80%" height={24} />
      <Skeleton width="50%" height={14} />
      <SkeletonCard lines={2} />
      <View style={styles.skeletonRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.flex}>
            <Skeleton height={110} radius={14} />
          </View>
        ))}
      </View>
      <SkeletonCard lines={4} />
    </View>
  );
}

export function MeetingDetailScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { isEnabled } = useConfig();
  const { id } = useLocalSearchParams<{ id: string }>();
  const meetingQuery = useMeeting(id);
  const meeting = meetingQuery.data;
  const [segment, setSegment] = useState<Segment>('summary');
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search.trim(), 250);
  const transcript = useTranscript(id, segment === 'transcript');
  const bot = useBotControl(id ?? '');
  const reprocess = useReprocessMeeting(id ?? '');
  const remove = useDeleteMeeting();
  const toggleAutoJoin = useToggleAutoJoin();
  const actionItems = useActionItemActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const refreshControl = useRefreshControl(() =>
    Promise.all([meetingQuery.refetch(), segment === 'transcript' ? transcript.refetch() : Promise.resolve()]),
  );

  const showActions = isEnabled('actionItems');
  const segments = [
    { value: 'summary' as const, label: 'Summary' },
    ...(showActions ? [{ value: 'actions' as const, label: 'Actions' }] : []),
    { value: 'transcript' as const, label: 'Transcript' },
    { value: 'people' as const, label: 'People' },
  ];
  const activeSegment: Segment = segment === 'actions' && !showActions ? 'summary' : segment;

  const openMeet = (m: MeetingDetail) => {
    if (m.meetingUrl) Linking.openURL(m.meetingUrl).catch(() => toast("Couldn't open the meeting link."));
  };

  const runBot = (action: 'join' | 'leave') => {
    bot.mutate(action, {
      onSuccess: () => toast(action === 'join' ? 'The notetaker is on its way.' : 'The notetaker is leaving the call.'),
    });
  };

  const confirmReprocess = () => {
    Alert.alert('Regenerate the report?', 'The AI will re-read the transcript and rebuild the summary, action items and scores.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Regenerate',
        onPress: () =>
          reprocess.mutate(undefined, {
            onSuccess: () => toast("Reprocessing started. We'll notify you when it's ready."),
          }),
      },
    ]);
  };

  const confirmDelete = (m: MeetingDetail) => {
    Alert.alert('Delete this meeting?', 'The transcript, report and its action items will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(m.id, {
            onSuccess: () => {
              toast('Meeting deleted');
              if (router.canGoBack()) router.back();
              else router.replace('/meetings');
            },
          }),
      },
    ]);
  };

  const menuOptions: ActionSheetOption[] = meeting
    ? [
        ...(meeting.meetingUrl ? [{ key: 'open', label: 'Open Google Meet', icon: ExternalLink, onPress: () => openMeet(meeting) }] : []),
        ...(canSendBot(meeting.status, meeting.meetingUrl)
          ? [{ key: 'join', label: 'Send notetaker now', icon: Send, onPress: () => runBot('join') }]
          : []),
        ...(canRecallBot(meeting.status) ? [{ key: 'leave', label: 'Remove notetaker', icon: LogOut, onPress: () => runBot('leave') }] : []),
        ...(meeting.status === 'completed' || meeting.status === 'failed'
          ? [{ key: 'reprocess', label: 'Regenerate report', icon: RefreshCw, onPress: confirmReprocess }]
          : []),
        { key: 'delete', label: 'Delete meeting', icon: Trash, destructive: true, onPress: () => confirmDelete(meeting) },
      ]
    : [];

  const screenOptions = (
    <Stack.Screen
      options={{
        title: '',
        headerRight: meeting
          ? () => <IconButton icon={EllipsisVertical} accessibilityLabel="Meeting actions" onPress={() => setMenuOpen(true)} />
          : undefined,
      }}
    />
  );

  if (meetingQuery.isPending) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        {screenOptions}
        <DetailSkeleton />
      </View>
    );
  }

  if (!meeting) {
    const notFound = isApiError(meetingQuery.error) && meetingQuery.error.status === 404;
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        {screenOptions}
        {notFound ? (
          <EmptyState
            icon={FileSearch}
            title="Meeting not found"
            message="It may have been deleted."
            action={{ label: 'Back to meetings', onPress: () => router.replace('/meetings') }}
          />
        ) : (
          <ErrorState error={meetingQuery.error} onRetry={() => void meetingQuery.refetch()} retrying={meetingQuery.isFetching} />
        )}
      </View>
    );
  }

  const allSegments: TranscriptSegment[] = transcript.data ?? [];
  const filtered = query ? allSegments.filter((s) => `${s.speaker} ${s.text}`.toLowerCase().includes(query.toLowerCase())) : allSegments;

  const header = (
    <View style={styles.header}>
      <MeetingHeader
        meeting={meeting}
        onOpenMeet={() => openMeet(meeting)}
        onBot={runBot}
        botPending={bot.isPending}
        onToggleAutoJoin={(value) =>
          toggleAutoJoin.mutate(
            { id: meeting.id, autoJoin: value },
          )
        }
      />
      {meeting.report ? <ScoresRow report={meeting.report} /> : null}
      <SegmentedControl options={segments} value={activeSegment} onChange={setSegment} />

      {activeSegment === 'summary' ? <SummaryTab meeting={meeting} onReprocess={confirmReprocess} /> : null}

      {activeSegment === 'actions' ? (
        <View style={styles.tab}>
          {meeting.actionItems.length ? (
            <ListGroup>
              {meeting.actionItems.map((item) => (
                <ActionItemRow
                  key={item.id}
                  item={item}
                  showMeeting={false}
                  onToggle={actionItems.onToggle}
                  onPress={() => openActionItemEditor(item)}
                  onMenu={actionItems.openMenu}
                />
              ))}
            </ListGroup>
          ) : (
            <EmptyState compact icon={ListChecks} title="No action items" message="Nothing was assigned in this meeting." />
          )}
          <Button label="Add action item" icon={Plus} variant="secondary" onPress={() => openActionItemEditor(undefined, meeting.id)} />
        </View>
      ) : null}

      {activeSegment === 'people' ? <PeopleTab meeting={meeting} /> : null}

      {activeSegment === 'transcript' ? (
        <View style={styles.tab}>
          <TextField
            icon={Search}
            placeholder="Search the transcript"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search the transcript"
          />
          {transcript.isPending ? (
            <View style={styles.skeleton}>
              {[0, 1, 2, 3].map((i) => (
                <SkeletonCard key={i} lines={2} />
              ))}
            </View>
          ) : transcript.isError ? (
            <ErrorState compact error={transcript.error} onRetry={() => void transcript.refetch()} />
          ) : !allSegments.length ? (
            <EmptyState compact icon={FileSearch} title="No transcript yet" message="The transcript appears once the notetaker has captured the call." />
          ) : query && !filtered.length ? (
            <EmptyState compact icon={Search} title="No matches" message={`Nothing in the transcript matches "${query}".`} />
          ) : query ? (
            <Text variant="caption" tone="secondary">
              {pluralize(filtered.length, 'match', 'matches')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {screenOptions}
      <FlatList
        data={activeSegment === 'transcript' ? filtered : []}
        keyExtractor={(s) => String(s.seq)}
        renderItem={({ item }) => <TranscriptItem segment={item} query={query} />}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={20}
        windowSize={11}
      />
      <ActionSheet visible={menuOpen} title={meeting.title} options={menuOptions} onClose={() => setMenuOpen(false)} />
      {actionItems.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  header: {
    gap: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  tab: {
    gap: 12,
  },
  skeleton: {
    padding: 16,
    gap: 14,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
});
