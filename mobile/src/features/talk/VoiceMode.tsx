import * as Speech from 'expo-speech';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranscribe } from '@/api/hooks/onboarding';
import type { LanguageStyle } from '@/api/types';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { RecordingOrb } from '@/features/capture/RecordingOrb';
import { pick } from '@/features/setup/shared';
import { useTheme } from '@/theme/ThemeProvider';

import { useVoiceInput } from './useVoiceInput';

type Phase = 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'paused';

/** Strips markdown and citation marks so the reply reads naturally aloud. */
function speakable(text: string): string {
  return text
    .replace(/\[\d+\]/g, '')
    .replace(/[*_#`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Full voice conversation (user-flow §05): listen → the friend answers out loud → listen again. Pauses in
 * speech end a turn; tapping the orb ends it early or resumes after a pause.
 */
export function VoiceMode({
  visible,
  lang,
  onClose,
  onSend,
}: {
  visible: boolean;
  lang: LanguageStyle;
  onClose: () => void;
  /** Sends the user's words; resolves to the friend's reply text. */
  onSend: (text: string) => Promise<string | null>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const transcribe = useTranscribe();
  const [phase, setPhase] = useState<Phase>('paused');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const open = useRef(false);

  const listenRef = useRef<() => void>(() => undefined);
  const voice = useVoiceInput({
    autoStop: true,
    onAutoStop: (uri) => void handleTurn(uri),
  });

  const handleTurn = async (uri: string | null) => {
    if (!open.current) return;
    if (!uri) {
      setPhase('paused');
      return;
    }
    setPhase('transcribing');
    let text = '';
    try {
      text = (await transcribe.mutateAsync(uri)).trim();
    } catch {
      text = '';
    }
    if (!open.current) return;
    if (!text) {
      listenRef.current();
      return;
    }
    setHeard(text);
    setPhase('thinking');
    const answer = await onSend(text);
    if (!open.current) return;
    if (!answer) {
      setPhase('paused');
      return;
    }
    setReply(answer);
    setPhase('speaking');
    Speech.speak(speakable(answer), {
      language: 'en-IN',
      rate: 1.0,
      onDone: () => {
        if (open.current) listenRef.current();
      },
      onStopped: () => undefined,
      onError: () => {
        if (open.current) listenRef.current();
      },
    });
  };

  const listen = useCallback(() => {
    void voice.start().then((r) => {
      if (r === 'started') setPhase('listening');
      else setPhase('paused');
    });
  }, [voice]);
  useEffect(() => {
    listenRef.current = listen;
  });

  useEffect(() => {
    open.current = visible;
    if (visible) {
      listenRef.current();
    } else {
      void Speech.stop();
      void voice.stop();
    }
    // Only react to opening / closing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /** Clears this conversation's lines so the next one starts fresh. */
  const close = () => {
    setHeard('');
    setReply('');
    onClose();
  };

  const tapOrb = () => {
    if (phase === 'listening') void voice.stop().then((uri) => void handleTurn(uri));
    else if (phase === 'speaking') {
      void Speech.stop();
      listen();
    } else if (phase === 'paused') listen();
  };

  const label: Record<Phase, string> = {
    listening: pick(lang, 'Listening…', 'Sun raha hoon…'),
    transcribing: pick(lang, 'Got it…', 'Samajh raha hoon…'),
    thinking: pick(lang, 'Thinking…', 'Soch raha hoon…'),
    speaking: pick(lang, 'Speaking (tap to interrupt)', 'Bol raha hoon (rokne ke liye tap karo)'),
    paused: pick(lang, 'Tap to talk', 'Bolne ke liye tap karo'),
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={[styles.screen, { backgroundColor: theme.colors.background, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.top}>
          <Text variant="micro" tone="muted" style={styles.spaced}>
            {pick(lang, 'VOICE CONVERSATION', 'VOICE BAATCHEET')}
          </Text>
          <IconButton icon={X} variant="tonal" accessibilityLabel="End voice conversation" onPress={close} />
        </View>
        <View style={styles.center}>
          <Touchable accessibilityRole="button" accessibilityLabel={label[phase]} onPress={tapOrb} rippleBorderless>
            <RecordingOrb recording={phase === 'listening' || phase === 'speaking'} level={phase === 'listening' ? voice.level : phase === 'speaking' ? 0.35 : 0} />
          </Touchable>
          <Text variant="subheading" align="center" accessibilityLiveRegion="polite">
            {label[phase]}
          </Text>
          {heard ? (
            <Text variant="callout" tone="secondary" align="center" numberOfLines={3}>
              “{heard}”
            </Text>
          ) : null}
          {reply ? (
            <Text variant="body" align="center" numberOfLines={6}>
              {speakable(reply)}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spaced: {
    letterSpacing: 1.5,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
});
