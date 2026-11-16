import { ArrowUp, Mic, Square } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getErrorMessage } from '@/api/errors';
import { useTranscribe } from '@/api/hooks/onboarding';
import type { LanguageStyle } from '@/api/types';
import { KeyboardAvoider } from '@/components/layout/KeyboardAvoider';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { pick } from '@/features/setup/shared';
import { useVoiceNote } from '@/features/setup/useVoiceNote';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { haptics } from '@/utils/haptics';
import { toast } from '@/utils/toast';

export interface ChatLine {
  role: 'user' | 'assistant';
  content: string;
}

function Bubble({ line }: { line: ChatLine }) {
  const theme = useTheme();
  const mine = line.role === 'user';
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
        {line.content}
      </Text>
    </View>
  );
}

/**
 * A chat with the friend (evening check-in, nudge replies): bubbles, a text box and a tap-to-talk mic
 * (voice is transcribed into the box so the user can edit before sending).
 */
export function CompanionChat({
  lines,
  onSend,
  thinking,
  lang,
  closed,
  footer,
  header,
}: {
  lines: ChatLine[];
  onSend: (text: string) => void;
  thinking: boolean;
  lang: LanguageStyle;
  /** No more replies (shows `footer` only). */
  closed?: boolean;
  footer?: ReactNode;
  header?: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const transcribe = useTranscribe();
  const voice = useVoiceNote({ onLimit: () => void stopAndTranscribe() });
  const [draft, setDraft] = useState('');
  const recording = voice.state === 'recording';

  const send = () => {
    const text = draft.trim();
    if (!text || thinking) return;
    haptics.light();
    setDraft('');
    onSend(text.slice(0, 1000));
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
    if (recording) {
      await stopAndTranscribe();
      return;
    }
    haptics.light();
    if (!(await voice.start())) {
      toast(pick(lang, 'Mic is off. You can type instead, or allow it in Settings.', 'Mic band hai. Type kar lo, ya Settings mein allow karo.'));
    }
  };

  return (
    <KeyboardAvoider>
      <View style={styles.flex}>
        <FlatList
          inverted
          data={[...lines].reverse()}
          keyExtractor={(_, i) => String(lines.length - i)}
          renderItem={({ item }) => <Bubble line={item} />}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          ListFooterComponent={header ? <View style={styles.header}>{header}</View> : undefined}
          ListHeaderComponent={
            thinking ? (
              <View style={[styles.bubble, styles.thinking, { backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl }]}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
              </View>
            ) : undefined
          }
        />
      </View>

      <View
        style={[
          styles.composerWrap,
          { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background, paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        {closed ? null : recording ? (
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
              accessibilityLabel="Your message"
              style={[
                styles.input,
                theme.typography.body,
                { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.lg },
              ]}
            />
            {draft.trim() ? (
              <IconButton icon={ArrowUp} variant="filled" accessibilityLabel="Send" disabled={thinking} onPress={send} />
            ) : (
              <IconButton icon={Mic} variant="tonal" accessibilityLabel="Talk instead" disabled={thinking || transcribe.isPending} onPress={() => void onMic()} />
            )}
          </View>
        )}
        {footer}
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
  header: {
    paddingBottom: 8,
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  thinking: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
  },
  composerWrap: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 4,
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
});
