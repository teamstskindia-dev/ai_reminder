import { router } from 'expo-router';
import { ArrowUp, AudioLines, Eye, EyeOff, HeartHandshake, History, MessageCirclePlus, Mic, Phone, Video } from 'lucide-react-native';
import { memo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getErrorMessage } from '@/api/errors';
import { useProfile, useTranscribe } from '@/api/hooks/onboarding';
import { useDeleteTalkThread, useSendTalk, useTalkMessages, useTalkThreads } from '@/api/hooks/talk';
import type { AssistantSource, LanguageStyle, TalkMessage } from '@/api/types';
import { KeyboardAvoider } from '@/components/layout/KeyboardAvoider';
import { TabHeader } from '@/components/layout/TabHeader';
import { Markdown } from '@/components/markdown/Markdown';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { EmptyState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useTabLabel } from '@/features/navigation/tabs';
import { pick } from '@/features/setup/shared';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { firstName, formatDayLabel, formatRelative } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { toast } from '@/utils/toast';

import { TalkActionCard } from './TalkActionCard';
import { useVoiceInput } from './useVoiceInput';
import { VoiceMode } from './VoiceMode';

type Item = TalkMessage & { pending?: boolean; failed?: string };

const STARTERS: { en: string; hi: string }[] = [
  { en: 'I need to vent about my day', hi: 'Aaj ke din ke baare mein kuch kehna hai' },
  { en: 'Help me decide something', hi: 'Ek decision mein help chahiye' },
  { en: 'What did I promise this week?', hi: 'Is hafte maine kya promise kiya tha?' },
  { en: 'Remind me to call mom tomorrow at 7 pm', hi: 'Kal shaam 7 baje mummy ko call karna yaad dilana' },
  { en: 'Set a call with Rahul Friday afternoon', hi: 'Friday afternoon Rahul ke saath call set karo' },
];

function SourceChip({ source, index }: { source: AssistantSource; index: number }) {
  const theme = useTheme();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={`Source ${index + 1}: ${source.meetingTitle}`}
      onPress={() => router.push(`/meeting/${source.meetingId}`)}
      style={[styles.source, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.md }]}
    >
      <View style={styles.sourceHead}>
        <View style={[styles.sourceIndex, { backgroundColor: theme.colors.primarySoft }]}>
          <Text variant="micro" tone="brand">{index + 1}</Text>
        </View>
        <Video size={14} color={theme.colors.textSecondary} />
        <Text variant="label" numberOfLines={1} style={styles.flex}>{source.meetingTitle}</Text>
      </View>
      <Text variant="caption" tone="muted">{formatDayLabel(source.startAt)}</Text>
      <Text variant="caption" tone="secondary" numberOfLines={3}>{source.snippet}</Text>
    </Touchable>
  );
}

/** Care first: helplines and a nudge toward people they trust (user-flow §05, crisis). */
function CrisisCard({ lang }: { lang: LanguageStyle }) {
  const theme = useTheme();
  return (
    <View style={[styles.crisis, { backgroundColor: theme.colors.dangerSoft, borderRadius: theme.radii.lg }]}>
      <View style={styles.rowCenter}>
        <HeartHandshake size={18} color={theme.colors.danger} />
        <Text variant="subheading" style={styles.flex}>{pick(lang, "You're not alone", 'Tum akele nahi ho')}</Text>
      </View>
      <Text variant="callout">
        {pick(
          lang,
          'Tele-MANAS is free, confidential and open 24x7. If you are in danger, call 112. Reaching out to someone you trust can help too.',
          'Tele-MANAS free hai, confidential hai aur 24x7 khula hai. Khatra ho toh 112 call karo. Kisi bharose wale se baat karna bhi madad karta hai.',
        )}
      </Text>
      <View style={styles.rowWrap}>
        <Button label="Tele-MANAS 14416" icon={Phone} size="sm" onPress={() => void Linking.openURL('tel:14416')} />
        <Button label={pick(lang, 'Emergency 112', 'Emergency 112')} size="sm" variant="secondary" onPress={() => void Linking.openURL('tel:112')} />
      </View>
    </View>
  );
}

const Message = memo(function Message({
  item,
  threadId,
  lang,
  onRetry,
}: {
  item: Item;
  threadId: string | null;
  lang: LanguageStyle;
  onRetry: (item: Item) => void;
}) {
  const theme = useTheme();
  if (item.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={[styles.userBubble, { backgroundColor: theme.colors.primary, borderRadius: theme.radii.lg }]}>
          <Text variant="body" color={theme.colors.primaryForeground}>{item.content}</Text>
        </View>
        {item.failed ? (
          <Touchable accessibilityRole="button" onPress={() => onRetry(item)} hitSlop={10}>
            <Text variant="caption" tone="danger">{item.failed} · {pick(lang, 'Tap to retry', 'Dobara bhejne ke liye tap karo')}</Text>
          </Touchable>
        ) : null}
      </View>
    );
  }
  const openSource = (n: number) => {
    const s = item.sources[n - 1];
    if (s) router.push(`/meeting/${s.meetingId}`);
  };
  const persisted = Boolean(threadId) && !item.id.startsWith('local-');
  return (
    <View style={styles.assistantRow}>
      <View style={[styles.assistantBubble, { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }, theme.elevation.card]}>
        <Markdown onCitationPress={item.sources.length ? openSource : undefined}>{item.content}</Markdown>
      </View>
      {item.crisis ? <CrisisCard lang={lang} /> : null}
      {item.actions.map((a) => (
        <TalkActionCard key={a.id} action={a} messageId={persisted ? item.id : null} threadId={threadId} lang={lang} />
      ))}
      {item.sources.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sources}>
          {item.sources.map((s, i) => (
            <SourceChip key={`${s.meetingId}-${i}`} source={s} index={i} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
});

function HistorySheet({ visible, lang, onClose, onOpen }: { visible: boolean; lang: LanguageStyle; onClose: () => void; onOpen: (id: string) => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const threads = useTalkThreads(visible);
  const remove = useDeleteTalkThread();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: theme.colors.background, paddingBottom: insets.bottom + 12, borderTopLeftRadius: 24, borderTopRightRadius: 24 }]}>
        <Text variant="subheading" style={styles.sheetTitle}>{pick(lang, 'Past conversations', 'Purani baatein')}</Text>
        {threads.isPending ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : threads.data?.items.length ? (
          <FlatList
            data={threads.data.items}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => (
              <Touchable
                accessibilityRole="button"
                onPress={() => onOpen(item.id)}
                onLongPress={() =>
                  Alert.alert(pick(lang, 'Delete this conversation?', 'Ye baatcheet delete karein?'), item.title, [
                    { text: pick(lang, 'Cancel', 'Rehne do'), style: 'cancel' },
                    { text: pick(lang, 'Delete', 'Delete karo'), style: 'destructive', onPress: () => remove.mutate(item.id) },
                  ])
                }
                style={[styles.threadRow, { borderBottomColor: theme.colors.border }]}
              >
                <Text variant="callout" numberOfLines={1} style={styles.flex}>{item.title}</Text>
                <Text variant="caption" tone="muted">{formatRelative(item.updatedAt)}</Text>
              </Touchable>
            )}
          />
        ) : (
          <EmptyState compact icon={History} title={pick(lang, 'No conversations yet', 'Abhi koi baatcheet nahi')} />
        )}
        <Text variant="micro" tone="muted" align="center">{pick(lang, 'Long-press to delete', 'Delete karne ke liye dabaye rakho')}</Text>
      </View>
    </Modal>
  );
}

/**
 * Talk with your friend (user-flow §05): type, hold to speak, or a full voice conversation. The friend
 * listens, advises, recalls from memory with sources, gets things done (reminders now; meetings and emails
 * as a preview to approve) and learns along the way. Incognito chats are not saved or learned from.
 */
export function TalkScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const profile = useProfile();
  const lang: LanguageStyle = profile.data?.languageStyle ?? 'english';
  const name = profile.data?.preferredName || firstName(user?.name, user?.email);
  const title = useTabLabel('ask', 'Talk');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [incognito, setIncognito] = useState(false);
  const [local, setLocal] = useState<Item[]>([]);
  const [draft, setDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const messages = useTalkMessages(incognito ? null : threadId);
  const send = useSendTalk();
  const transcribe = useTranscribe();
  const hold = useVoiceInput();
  const incognitoHistory = useRef<Item[]>([]);

  const items: Item[] = incognito ? local : [...(messages.data ?? []), ...local];

  const newChat = () => {
    setThreadId(null);
    setLocal([]);
    incognitoHistory.current = [];
  };

  const toggleIncognito = () => {
    haptics.selection();
    newChat();
    setIncognito((v) => !v);
    toast(
      incognito
        ? pick(lang, 'Incognito off', 'Incognito band')
        : pick(lang, 'Incognito: nothing from this chat is saved or learned', 'Incognito: is chat ka kuch save ya yaad nahi hoga'),
    );
  };

  /** Sends one message; resolves to the friend's reply text (used by voice mode). */
  const sendText = async (raw: string, retryOf?: string): Promise<string | null> => {
    const text = raw.trim();
    if (!text || send.isPending) return null;
    haptics.light();
    const tempId = `local-${Date.now()}`;
    const mine: Item = { id: tempId, role: 'user', content: text, sources: [], actions: [], intent: null, crisis: false, createdAt: new Date().toISOString(), pending: true };
    setLocal((prev) => [...prev.filter((i) => i.id !== retryOf), mine]);
    setDraft('');
    try {
      const res = await send.mutateAsync({
        text,
        threadId: incognito ? undefined : (threadId ?? undefined),
        incognito,
        history: incognito ? incognitoHistory.current.slice(-12).map((m) => ({ role: m.role, content: m.content })) : undefined,
      });
      if (incognito) {
        const pair = [res.userMessage, res.reply];
        incognitoHistory.current = [...incognitoHistory.current, ...pair];
        setLocal((prev) => [...prev.filter((i) => i.id !== tempId), ...pair]);
      } else {
        setLocal([]);
        if (res.threadId && res.threadId !== threadId) setThreadId(res.threadId);
      }
      return res.reply.content;
    } catch (error) {
      setLocal((prev) => prev.map((i) => (i.id === tempId ? { ...i, pending: false, failed: getErrorMessage(error, pick(lang, 'Not sent', 'Nahi gaya')) } : i)));
      return null;
    }
  };

  // Hold to speak: press starts, release transcribes and sends.
  const onHoldStart = async () => {
    const r = await hold.start();
    if (r === 'denied') toast(pick(lang, 'Mic is off. Allow it in Settings, or type instead.', 'Mic band hai. Settings mein allow karo, ya type karo.'));
  };
  const onHoldEnd = async () => {
    if (hold.state !== 'recording') return;
    const uri = await hold.stop();
    if (!uri) return;
    try {
      const text = await transcribe.mutateAsync(uri);
      if (text.trim()) await sendText(text);
      else toast(pick(lang, "I didn't catch that.", 'Samajh nahi aaya.'));
    } catch (e) {
      toast(getErrorMessage(e, pick(lang, "Couldn't hear that. Try typing.", 'Sun nahi paaya. Type karke try karo.')));
    }
  };

  const listening = hold.state === 'recording';
  const busy = send.isPending || transcribe.isPending;

  const empty = (
    <ScrollView contentContainerStyle={styles.empty} keyboardShouldPersistTaps="handled">
      <View style={[styles.heroIcon, { backgroundColor: incognito ? theme.colors.surfaceMuted : theme.colors.primarySoft }]}>
        {incognito ? <EyeOff size={28} color={theme.colors.textSecondary} /> : <HeartHandshake size={28} color={theme.colors.primaryText} />}
      </View>
      <Text variant="title" align="center">
        {incognito
          ? pick(lang, 'Incognito chat', 'Incognito chat')
          : pick(lang, `Hey${name ? ` ${name}` : ''}, what's on your mind?`, `Hey${name ? ` ${name}` : ''}, kya chal raha hai?`)}
      </Text>
      <Text variant="callout" tone="secondary" align="center">
        {incognito
          ? pick(lang, "Nothing from this chat is saved or learned.", 'Is chat ka kuch bhi save ya yaad nahi hoga.')
          : pick(lang, 'Vent, ask for advice, ask what someone said, or get something done. Type, hold the mic, or talk.', 'Mann ki baat, advice, kisne kya kaha, ya koi kaam. Type karo, mic dabaye rakho, ya bolo.')}
      </Text>
      <View style={styles.starters}>
        {STARTERS.map((s) => (
          <Touchable
            key={s.en}
            accessibilityRole="button"
            onPress={() => void sendText(pick(lang, s.en, s.hi))}
            style={[styles.starter, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.md }]}
          >
            <Text variant="callout">{pick(lang, s.en, s.hi)}</Text>
          </Touchable>
        ))}
      </View>
    </ScrollView>
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <TabHeader
        title={title}
        right={
          <>
            <IconButton icon={incognito ? EyeOff : Eye} accessibilityLabel={incognito ? 'Turn incognito off' : 'Turn incognito on'} onPress={toggleIncognito} color={incognito ? theme.colors.primaryText : undefined} />
            {items.length ? <IconButton icon={MessageCirclePlus} accessibilityLabel="New conversation" onPress={newChat} /> : null}
            {!incognito ? <IconButton icon={History} accessibilityLabel="Past conversations" onPress={() => setHistoryOpen(true)} /> : null}
          </>
        }
      />
      {incognito ? (
        <View style={[styles.incognitoBar, { backgroundColor: theme.colors.surfaceMuted }]}>
          <EyeOff size={14} color={theme.colors.textSecondary} />
          <Text variant="caption" tone="secondary">{pick(lang, 'Incognito: not saved, not learned', 'Incognito: na save, na yaad')}</Text>
        </View>
      ) : null}
      <KeyboardAvoider>
        <View style={styles.flex}>
          {!incognito && threadId && messages.isPending ? (
            <ActivityIndicator style={styles.loading} color={theme.colors.primary} />
          ) : items.length ? (
            <FlatList
              inverted
              data={[...items].reverse()}
              keyExtractor={(i) => i.id}
              renderItem={({ item }) => <Message item={item} threadId={incognito ? null : threadId} lang={lang} onRetry={(i) => void sendText(i.content, i.id)} />}
              ListHeaderComponent={
                busy ? (
                  <View style={[styles.assistantBubble, styles.thinking, { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }]}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                    <Text variant="callout" tone="secondary">{transcribe.isPending ? pick(lang, 'Listening…', 'Sun raha hoon…') : pick(lang, 'Thinking…', 'Soch raha hoon…')}</Text>
                  </View>
                ) : undefined
              }
              contentContainerStyle={styles.messages}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            />
          ) : (
            empty
          )}
        </View>
        <View style={[styles.composer, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          {listening ? (
            <View style={[styles.holding, { backgroundColor: theme.colors.dangerSoft, borderRadius: theme.radii.lg }]}>
              <View style={[styles.dot, { backgroundColor: theme.colors.danger, transform: [{ scale: 1 + hold.level * 0.8 }] }]} />
              <Text variant="label" tone="danger" style={styles.flex}>{pick(lang, 'Listening… release to send', 'Sun raha hoon… chhodo toh bhej dunga')}</Text>
            </View>
          ) : (
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={pick(lang, 'Message your friend…', 'Apne friend ko likho…')}
              placeholderTextColor={theme.colors.textMuted}
              selectionColor={theme.colors.primary}
              cursorColor={theme.colors.primary}
              multiline
              maxLength={2000}
              accessibilityLabel="Your message"
              style={[styles.input, theme.typography.body, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.lg }]}
            />
          )}
          {draft.trim() ? (
            <IconButton icon={ArrowUp} variant="filled" accessibilityLabel="Send" disabled={busy} onPress={() => void sendText(draft)} />
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hold to speak"
                disabled={busy}
                onPressIn={() => void onHoldStart()}
                onPressOut={() => void onHoldEnd()}
                style={[styles.mic, { backgroundColor: listening ? theme.colors.danger : theme.colors.primarySoft, opacity: busy ? 0.5 : 1 }]}
              >
                <Mic size={22} color={listening ? theme.colors.primaryForeground : theme.colors.primaryText} />
              </Pressable>
              {!listening ? <IconButton icon={AudioLines} variant="tonal" accessibilityLabel="Voice conversation" disabled={busy} onPress={() => setVoiceOpen(true)} /> : null}
            </>
          )}
        </View>
      </KeyboardAvoider>
      <HistorySheet
        visible={historyOpen}
        lang={lang}
        onClose={() => setHistoryOpen(false)}
        onOpen={(id) => {
          setHistoryOpen(false);
          setLocal([]);
          setThreadId(id);
        }}
      />
      <VoiceMode visible={voiceOpen} lang={lang} onClose={() => setVoiceOpen(false)} onSend={sendText} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  loading: { marginTop: 32 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  incognitoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  empty: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', padding: 16, gap: 10, flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  starters: { alignSelf: 'stretch', gap: 8, marginTop: 12 },
  starter: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12, borderWidth: StyleSheet.hairlineWidth },
  messages: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', padding: 16, gap: 16 },
  userRow: { alignItems: 'flex-end', gap: 4 },
  userBubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderBottomRightRadius: 4 },
  assistantRow: { gap: 8 },
  assistantBubble: { alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 12, borderBottomLeftRadius: 4 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  crisis: { padding: 14, gap: 10 },
  sources: { gap: 8, paddingRight: 16 },
  source: { width: 220, padding: 12, gap: 4, borderWidth: StyleSheet.hairlineWidth },
  sourceHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceIndex: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  composer: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 48, maxHeight: 120, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, borderWidth: 1, textAlignVertical: 'center', includeFontPadding: false },
  holding: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 48 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  mic: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1 },
  sheet: { maxHeight: '70%', paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  sheetTitle: { marginBottom: 4 },
  threadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
