import { ArrowUp, Mic, RotateCcw, Sparkles, Square } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getErrorMessage } from '@/api/errors';
import { useBuildProfile, useOnboardingChat, useTranscribe } from '@/api/hooks/onboarding';
import type { LanguageStyle, OnboardingChatMessage, UserProfile } from '@/api/types';
import { KeyboardAvoider } from '@/components/layout/KeyboardAvoider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { haptics } from '@/utils/haptics';
import { toast } from '@/utils/toast';

import { pick } from '../shared';
import { useVoiceNote } from '../useVoiceNote';

const LANGUAGE_LABEL: Record<LanguageStyle, string> = { english: 'English', hinglish: 'Hinglish', mixed: 'English + Hinglish' };

function Bubble({ message }: { message: OnboardingChatMessage }) {
  const theme = useTheme();
  const mine = message.role === 'user';
  return (
    <View
      style={[
        styles.bubble,
        mine
          ? { alignSelf: 'flex-end', backgroundColor: theme.colors.primary, borderBottomRightRadius: 6 }
          : { alignSelf: 'flex-start', backgroundColor: theme.colors.surface, borderBottomLeftRadius: 6, ...theme.elevation.card },
        { borderRadius: theme.radii.xl },
      ]}
    >
      <Text variant="body" color={mine ? theme.colors.primaryForeground : theme.colors.text}>
        {message.content}
      </Text>
    </View>
  );
}

function ProfileCard({ profile, lang }: { profile: UserProfile; lang: LanguageStyle }) {
  const theme = useTheme();
  const rows: [string, string | null][] = [
    [pick(lang, 'I’ll call you', 'Aapko bulaunga'), profile.preferredName],
    [pick(lang, 'You do', 'Aap karte ho'), profile.occupation],
    [pick(lang, 'On your mind', 'Dimaag mein'), profile.currentFocus],
    [pick(lang, 'Talk to you', 'Baat karunga'), profile.communicationStyle],
  ];
  return (
    <Card>
      <View style={styles.profileCard}>
        <View style={styles.profileHead}>
          <Sparkles size={18} color={theme.colors.primaryText} />
          <Text variant="subheading">{pick(lang, 'Here’s what I got', 'Maine yeh samjha')}</Text>
        </View>
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <View key={label} style={styles.profileRow}>
              <Text variant="caption" tone="muted">
                {label}
              </Text>
              <Text variant="callout">{value}</Text>
            </View>
          ))}
        <Chip label={LANGUAGE_LABEL[profile.languageStyle]} tone="brand" />
        <Text variant="caption" tone="muted">
          {pick(lang, 'You can see, fix or delete this any time in Profile.', 'Yeh sab Profile mein kabhi bhi dekh, badal ya delete kar sakte ho.')}
        </Text>
      </View>
    </Card>
  );
}

export function ChatStep({
  messages,
  setMessages,
  lang,
  setLang,
  onNext,
}: {
  messages: OnboardingChatMessage[];
  setMessages: (messages: OnboardingChatMessage[]) => void;
  lang: LanguageStyle;
  setLang: (lang: LanguageStyle) => void;
  onNext: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);
  const chat = useOnboardingChat();
  const build = useBuildProfile();
  const transcribe = useTranscribe();
  const voice = useVoiceNote({ onLimit: () => void stopAndTranscribe() });
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const finishing = build.isPending;
  const requested = useRef(false);

  const answers = messages.filter((m) => m.role === 'user').length;

  const ask = (history: OnboardingChatMessage[]) => {
    chat.mutate(history, {
      onSuccess: (reply) => {
        setLang(reply.languageStyle);
        const next = [...history, { role: 'assistant' as const, content: reply.reply }];
        setMessages(next);
        if (reply.done) finish(next);
      },
      onError: (e) => setError(getErrorMessage(e, pick(lang, "I couldn't reply just now.", 'Abhi reply nahi kar paaya.'))),
    });
  };

  const finish = (history: OnboardingChatMessage[]) => {
    build.mutate(history, {
      onSuccess: (p) => {
        setLang(p.languageStyle);
        setProfile(p);
        haptics.success();
      },
      // The answers are still saved server-side on retry; never trap the user here.
      onError: () => onNext(),
    });
  };

  // Opening message on first entry; resume a reply that was in flight when the app closed.
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    const last = messages[messages.length - 1];
    if (!messages.length || last?.role === 'user') ask(messages);
    else if (answers >= 4 && !profile) finish(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = () => {
    const text = draft.trim();
    if (!text || chat.isPending || finishing) return;
    haptics.light();
    setDraft('');
    setError(null);
    const next = [...messages, { role: 'user' as const, content: text.slice(0, 1000) }];
    setMessages(next);
    ask(next);
  };

  const stopAndTranscribe = async () => {
    const uri = await voice.stop();
    if (!uri) return;
    transcribe.mutate(uri, {
      onSuccess: (text) => {
        if (!text) {
          toast(pick(lang, "I didn't catch that. Try again or type it.", 'Samajh nahi aaya. Dobara bolo ya type karo.'));
          return;
        }
        setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text));
      },
      onError: (e) => toast(getErrorMessage(e, pick(lang, "Couldn't transcribe that. You can type instead.", 'Transcribe nahi ho paaya. Type kar sakte ho.'))),
    });
  };

  const onMic = async () => {
    if (voice.state === 'recording') {
      await stopAndTranscribe();
      return;
    }
    haptics.light();
    const ok = await voice.start();
    if (!ok) {
      toast(pick(lang, 'Mic is off. You can type instead, or allow it in Settings.', 'Mic band hai. Type kar lo, ya Settings mein allow karo.'));
    }
  };

  const skip = () => {
    build.mutate(messages, { onSettled: () => onNext() });
  };

  if (profile) {
    return (
      <View style={styles.flex}>
        <View style={[styles.summary, { maxWidth: MAX_CONTENT_WIDTH }]}>
          <ProfileCard profile={profile} lang={lang} />
        </View>
        <View style={[styles.summaryFooter, { paddingBottom: bottomPad + 16 }]}>
          <Button label={pick(lang, 'Looks good', 'Sahi hai')} onPress={onNext} size="lg" fullWidth />
        </View>
      </View>
    );
  }

  const busy = chat.isPending || finishing;
  const recording = voice.state === 'recording';
  const thinking = chat.isPending || (finishing && !profile);

  return (
    <KeyboardAvoider>
      <View style={styles.flex}>
        <FlatList
          inverted
          data={[...messages].reverse()}
          keyExtractor={(_, i) => String(messages.length - i)}
          renderItem={({ item }) => <Bubble message={item} />}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          ListHeaderComponent={
            thinking ? (
              <View style={[styles.bubble, styles.thinking, { backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl }]}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                {finishing ? (
                  <Text variant="caption" tone="secondary">
                    {pick(lang, 'Getting to know you…', 'Aapko samajh raha hoon…')}
                  </Text>
                ) : null}
              </View>
            ) : error ? (
              <View style={styles.error}>
                <Text variant="caption" tone="danger">
                  {error}
                </Text>
                <Button label={pick(lang, 'Try again', 'Phir se try karo')} icon={RotateCcw} size="sm" variant="secondary" onPress={() => {
                    setError(null);
                    ask(messages);
                  }}
                />
              </View>
            ) : undefined
          }
        />
      </View>

      <View style={[styles.composerWrap, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background, paddingBottom: bottomPad }]}>
        {recording ? (
          <View style={[styles.recording, { backgroundColor: theme.colors.dangerSoft, borderRadius: theme.radii.lg }]}>
            <View style={[styles.dot, { backgroundColor: theme.colors.danger }]} />
            <Text variant="label" tone="danger" style={styles.flex}>
              {pick(lang, 'Listening…', 'Sun raha hoon…')} 0:{String(voice.seconds).padStart(2, '0')} / 1:00
            </Text>
            <IconButton icon={Square} variant="filled" color={theme.colors.danger} accessibilityLabel="Stop recording" onPress={() => void onMic()} />
          </View>
        ) : (
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={transcribe.isPending ? pick(lang, 'Transcribing…', 'Likh raha hoon…') : pick(lang, 'Type or tap the mic…', 'Type karo ya mic dabao…')}
              placeholderTextColor={theme.colors.textMuted}
              selectionColor={theme.colors.primary}
              cursorColor={theme.colors.primary}
              multiline
              maxLength={1000}
              editable={!transcribe.isPending}
              accessibilityLabel="Your answer"
              style={[
                styles.input,
                theme.typography.body,
                { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.lg },
              ]}
            />
            {draft.trim() ? (
              <IconButton icon={ArrowUp} variant="filled" accessibilityLabel="Send answer" disabled={busy} onPress={send} />
            ) : (
              <IconButton
                icon={Mic}
                variant="tonal"
                accessibilityLabel="Answer by voice"
                disabled={busy || transcribe.isPending}
                onPress={() => void onMic()}
              />
            )}
          </View>
        )}
        <Button
          label={answers ? pick(lang, 'Skip the rest', 'Baaki skip karo') : pick(lang, 'Skip for now', 'Abhi skip karo')}
          variant="ghost"
          size="sm"
          disabled={busy || recording}
          onPress={skip}
        />
      </View>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  messages: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: 16,
    gap: 10,
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  thinking: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
  },
  error: {
    alignSelf: 'flex-start',
    gap: 8,
  },
  composerWrap: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  composer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
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
  recording: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 4,
    minHeight: 52,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  summary: {
    width: '100%',
    alignSelf: 'center',
    padding: 24,
  },
  summaryFooter: {
    marginTop: 'auto',
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  profileCard: {
    gap: 12,
  },
  profileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileRow: {
    gap: 2,
  },
});
