import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowUp, History, MessageCirclePlus, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { getErrorMessage, isApiError } from '@/api/errors';
import { useAsk, useThreadMessages } from '@/api/hooks/assistant';
import { qk } from '@/api/queryKeys';
import type { AssistantMessage, DashboardHome } from '@/api/types';
import { FeatureGate } from '@/components/FeatureGate';
import { KeyboardAvoider } from '@/components/layout/KeyboardAvoider';
import { TabHeader } from '@/components/layout/TabHeader';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useTabLabel } from '@/features/navigation/tabs';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { haptics } from '@/utils/haptics';

import { ChatMessage, type ChatItem } from './ChatMessage';

const STARTERS = [
  'What did I promise this week?',
  'Summarize my meetings from yesterday',
  'Which action items are overdue?',
  'What decisions did we make recently?',
];

function askErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === 'RATE_LIMITED') {
      return error.retryAfterSeconds
        ? `You've hit the question limit. Try again in ${Math.ceil(error.retryAfterSeconds / 60)} min.`
        : "You've hit the question limit for now. Please try again later.";
    }
    if (error.code === 'FORBIDDEN' || error.code === 'PAYLOAD_TOO_LARGE') return error.message || 'Your plan limit has been reached.';
  }
  return getErrorMessage(error, "Couldn't get an answer. Please try again.");
}

function toChatItem(message: AssistantMessage): ChatItem {
  return { id: message.id, role: message.role, content: message.content, sources: message.sources };
}

const THINKING: ChatItem = { id: 'thinking', role: 'assistant', content: '', sources: [], status: 'thinking' };

function AskContent() {
  const theme = useTheme();
  const qc = useQueryClient();
  const { config } = useConfig();
  const title = useTabLabel('ask', 'Ask');
  const params = useLocalSearchParams<{ threadId?: string }>();
  const threadId = typeof params.threadId === 'string' && params.threadId ? params.threadId : null;
  const thread = useThreadMessages(threadId);
  const ask = useAsk();
  const [draft, setDraft] = useState('');
  // Messages sent in this session that the server hasn't confirmed yet, scoped to their thread.
  const [pending, setPending] = useState<{ threadKey: string | null; items: ChatItem[] }>({ threadKey: null, items: [] });
  const pendingItems = pending.threadKey === threadId ? pending.items : [];

  const recentTitle = qc.getQueryData<DashboardHome>(qk.dashboard)?.recentReports[0]?.title;
  const starters = recentTitle ? [`What were the key takeaways from “${recentTitle}”?`, ...STARTERS.slice(0, 3)] : STARTERS;

  const send = (raw: string, replaceId?: string) => {
    const question = raw.trim();
    if (!question || ask.isPending) return;
    haptics.light();
    const tempId = `local-${Date.now()}`;
    const base = replaceId ? pendingItems.filter((i) => i.id !== replaceId) : pendingItems;
    setPending({ threadKey: threadId, items: [...base, { id: tempId, role: 'user', content: question, sources: [] }] });
    setDraft('');
    ask.mutate(
      { question, threadId: threadId ?? undefined },
      {
        onSuccess: ({ threadId: newThreadId, message }) => {
          const userMessage: AssistantMessage = {
            id: tempId,
            threadId: newThreadId,
            role: 'user',
            content: question,
            sources: [],
            createdAt: new Date().toISOString(),
          };
          qc.setQueryData<AssistantMessage[]>(qk.assistant.messages(newThreadId), (prev) => [...(prev ?? []), userMessage, message]);
          setPending({ threadKey: newThreadId, items: [] });
          if (newThreadId !== threadId) router.setParams({ threadId: newThreadId });
        },
        onError: (error) =>
          setPending((prev) => ({
            ...prev,
            items: prev.items.map((i) => (i.id === tempId ? { ...i, status: 'failed', error: askErrorMessage(error) } : i)),
          })),
      },
    );
  };

  const items: ChatItem[] = [...(thread.data ?? []).map(toChatItem), ...pendingItems, ...(ask.isPending ? [THINKING] : [])];
  const isEmpty = !threadId && items.length === 0;
  const canSend = draft.trim().length > 0 && !ask.isPending;

  const renderBody = () => {
    if (threadId && thread.isPending) {
      return (
        <View style={styles.loading}>
          <Skeleton width="60%" height={44} radius={16} style={styles.right} />
          <Skeleton width="85%" height={120} radius={16} />
          <Skeleton width="50%" height={44} radius={16} style={styles.right} />
        </View>
      );
    }
    if (threadId && thread.isError) {
      return <ErrorState error={thread.error} onRetry={() => void thread.refetch()} retrying={thread.isFetching} />;
    }
    if (isEmpty) {
      return (
        <FlatList
          data={starters}
          keyExtractor={(s) => s}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.empty}
          ListHeaderComponent={
            <View style={styles.hero}>
              <View style={[styles.heroIcon, { backgroundColor: theme.colors.primarySoft }]}>
                <Sparkles size={28} color={theme.colors.primaryText} />
              </View>
              <Text variant="title" align="center">
                Ask {config.branding.appName} anything
              </Text>
              <Text variant="callout" tone="secondary" align="center">
                Answers come from your meeting transcripts, with sources you can open.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={`Ask: ${item}`}
              onPress={() => send(item)}
              style={({ pressed }) => [
                styles.starter,
                {
                  backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.md,
                },
              ]}
            >
              <Text variant="callout">{item}</Text>
            </Touchable>
          )}
        />
      );
    }
    return (
      <FlatList
        inverted
        data={[...items].reverse()}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <ChatMessage item={item} onRetry={(failed) => send(failed.content, failed.id)} />}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      />
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <TabHeader
        title={title}
        right={
          <>
            {threadId || items.length ? (
              <IconButton icon={MessageCirclePlus} accessibilityLabel="New conversation" onPress={() => router.setParams({ threadId: '' })} />
            ) : null}
            <IconButton icon={History} accessibilityLabel="Past conversations" onPress={() => router.push('/threads')} />
          </>
        }
      />
      <KeyboardAvoider>
        <View style={styles.flex}>{renderBody()}</View>
        <View style={[styles.composer, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about your meetings…"
            placeholderTextColor={theme.colors.textMuted}
            selectionColor={theme.colors.primary}
            cursorColor={theme.colors.primary}
            multiline
            maxLength={1000}
            accessibilityLabel="Your question"
            style={[
              styles.input,
              theme.typography.body,
              { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.lg },
            ]}
          />
          <IconButton icon={ArrowUp} variant="filled" accessibilityLabel="Send question" disabled={!canSend} onPress={() => send(draft)} />
        </View>
      </KeyboardAvoider>
    </View>
  );
}

export function AskScreen() {
  return (
    <FeatureGate feature="askAi">
      <AskContent />
    </FeatureGate>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  loading: {
    padding: 16,
    gap: 16,
  },
  right: {
    alignSelf: 'flex-end',
  },
  empty: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: 16,
    gap: 10,
    flexGrow: 1,
    justifyContent: 'center',
  },
  hero: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  starter: {
    overflow: 'hidden',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  messages: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: 16,
    gap: 16,
  },
  composer: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderWidth: 1,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
});
