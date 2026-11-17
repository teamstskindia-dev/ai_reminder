import NetInfo from '@react-native-community/netinfo';
import { useLocalSearchParams } from 'expo-router';
import { Bookmark, CalendarDays, CheckCircle2, Mic, MicOff, Pause, Pencil, PhoneOff, Play, ShieldCheck, Square, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMeeting } from '@/api/hooks/meetings';
import { useProfile } from '@/api/hooks/onboarding';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { goBack } from '@/features/navigation/goBack';
import { pick } from '@/features/setup/shared';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { readJson, writeJson } from '@/utils/storage';
import { formatTimestamp as formatClock } from '@/utils/format';
import { toast } from '@/utils/toast';

import { RecordingOrb } from './RecordingOrb';
import { useCaptureRecorder, type StopResult } from './useCaptureRecorder';
import { Waveform } from './Waveform';

const CONSENT_KEY = 'remi.capture.consentSeen.v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Quick notes after a meeting: about 30 seconds, stopped automatically at 2 minutes. */
const NOTES_MAX_MS = 2 * 60_000;

type Screen = 'loading' | 'consent' | 'blocked' | 'recorder' | 'saved';

/**
 * Tap to record (user-flow §04): consent reminder on the first recording ever, then a recording screen
 * with timer, waveform and a clear recording indicator; pause, bookmark, title, stop, or stop and delete.
 */
export function RecordScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const lang = profile.data?.languageStyle ?? 'english';
  const [screen, setScreen] = useState<Screen>('loading');
  const [title, setTitleText] = useState('');
  // Opened from "Meeting starting: record it?" or "Add quick notes?": linked to that calendar meeting.
  const params = useLocalSearchParams<{ meetingId?: string; mode?: string }>();
  const meetingId = typeof params.meetingId === 'string' && UUID_RE.test(params.meetingId) ? params.meetingId : null;
  const notesMode = params.mode === 'notes';
  const event = useMeeting(meetingId ?? undefined);
  const [savedOffline, setSavedOffline] = useState(false);
  const started = useRef(false);
  /** "Stop and save", set once the recorder exists (the check-in alert is created before it). */
  const finishRef = useRef<() => void>(() => undefined);

  const onCheckIn = useCallback(() => {
    Alert.alert(
      pick(lang, 'Still recording?', 'Abhi bhi record kar rahe ho?'),
      pick(lang, 'This recording has been going for a while.', 'Recording kaafi der se chal rahi hai.'),
      [
        { text: pick(lang, 'Stop and save', 'Roko aur save karo'), onPress: () => finishRef.current() },
        { text: pick(lang, 'Keep recording', 'Chalne do'), style: 'cancel' },
      ],
    );
  }, [lang]);

  const rec = useCaptureRecorder({ onCheckIn });
  const active = rec.phase === 'recording' || rec.phase === 'paused' || rec.phase === 'interrupted';

  const close = () => goBack();

  const begin = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    const result = await rec.start(title, meetingId);
    if (result === 'started') {
      setScreen('recorder');
      return;
    }
    started.current = false;
    if (result === 'blocked' || result === 'denied') {
      setScreen('blocked');
      return;
    }
    toast(pick(lang, "Couldn't start recording. Try again.", 'Recording shuru nahi ho paayi. Dobara try karo.'));
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.start, title, lang, meetingId]);

  // One tap: start right away unless this is the first recording ever (consent reminder first).
  useEffect(() => {
    void readJson<boolean>(CONSENT_KEY).then((seen) => {
      if (seen) void begin();
      else setScreen('consent');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptConsent = async () => {
    await writeJson(CONSENT_KEY, true);
    await begin();
  };

  const handleStop = async (result: StopResult) => {
    if (result.kind === 'too_short') {
      toast(pick(lang, 'Too short, nothing to process.', 'Bahut chhoti thi, process karne ko kuch nahi.'));
      close();
      return;
    }
    if (result.kind === 'error') {
      toast(pick(lang, 'Something went wrong while saving.', 'Save karte waqt gadbad hui.'));
      close();
      return;
    }
    const net = await NetInfo.fetch();
    setSavedOffline(net.isConnected === false);
    setScreen('saved');
  };

  const finish = async () => {
    await handleStop(await rec.stop());
  };
  useEffect(() => {
    finishRef.current = () => void finish();
  });
  const notesDone = useRef(false);
  useEffect(() => {
    if (notesMode && !notesDone.current && rec.phase === 'recording' && rec.elapsedMs >= NOTES_MAX_MS) {
      notesDone.current = true;
      finishRef.current();
    }
  }, [notesMode, rec.phase, rec.elapsedMs]);

  const confirmDelete = () => {
    Alert.alert(
      pick(lang, 'Stop and delete?', 'Roko aur delete karo?'),
      pick(lang, 'Nothing from this recording will be kept.', 'Is recording ka kuch bhi save nahi hoga.'),
      [
        { text: pick(lang, 'Cancel', 'Rehne do'), style: 'cancel' },
        {
          text: pick(lang, 'Delete', 'Delete karo'),
          style: 'destructive',
          onPress: () => {
            void rec.discard().then(() => {
              toast(pick(lang, 'Recording deleted.', 'Recording delete ho gayi.'));
              close();
            });
          },
        },
      ],
    );
  };

  const askClose = useCallback(() => {
    if (!active) {
      close();
      return true;
    }
    Alert.alert(pick(lang, 'Stop recording?', 'Recording roken?'), undefined, [
      { text: pick(lang, 'Keep recording', 'Chalne do'), style: 'cancel' },
      { text: pick(lang, 'Delete it', 'Delete karo'), style: 'destructive', onPress: confirmDelete },
      { text: pick(lang, 'Stop and save', 'Roko aur save karo'), onPress: () => void finish() },
    ]);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lang]);

  // Android back button never silently drops a running recording.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', askClose);
    return () => sub.remove();
  }, [askClose]);

  const onBookmark = async () => {
    const at = await rec.bookmark();
    if (at !== null) toast(`${pick(lang, 'Bookmarked', 'Bookmark kiya')} ${formatClock(at)}`);
  };

  const onTitle = (value: string) => {
    setTitleText(value);
    rec.setTitle(value);
  };

  const padding = { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) + 8 };

  if (screen === 'consent') {
    return (
      <View style={[styles.screen, padding, { backgroundColor: theme.colors.background }]}>
        <View style={styles.topBar}>
          <IconButton icon={X} accessibilityLabel="Close" onPress={close} />
        </View>
        <ScrollView contentContainerStyle={styles.center}>
          <View style={[styles.bigIcon, { backgroundColor: theme.colors.primarySoft }]}>
            <ShieldCheck size={36} color={theme.colors.primaryText} />
          </View>
          <Text variant="title" align="center">
            {pick(lang, 'Let people know you’re recording', 'Logon ko bata do ki record kar rahe ho')}
          </Text>
          <Text variant="body" tone="secondary" align="center">
            {pick(
              lang,
              'It’s polite, and in many places the law: tell everyone in the conversation before you record. If someone says no, you can stop and delete in one tap.',
              'Ye tameez bhi hai aur kai jagah kanoon bhi: record karne se pehle sabko bata do. Koi mana kare toh ek tap mein roko aur delete karo.',
            )}
          </Text>
          <Text variant="caption" tone="muted" align="center">
            {pick(
              lang,
              'The audio is deleted after processing. Only the transcript, summary and what I found are kept.',
              'Process hone ke baad audio delete ho jaata hai. Sirf transcript, summary aur jo maine nikala wo rehta hai.',
            )}
          </Text>
        </ScrollView>
        <Button label={pick(lang, 'Got it, start recording', 'Samajh gaya, record karo')} icon={Mic} size="lg" fullWidth onPress={() => void acceptConsent()} />
      </View>
    );
  }

  if (screen === 'blocked') {
    return (
      <View style={[styles.screen, padding, { backgroundColor: theme.colors.background }]}>
        <View style={styles.topBar}>
          <IconButton icon={X} accessibilityLabel="Close" onPress={close} />
        </View>
        <View style={styles.center}>
          <View style={[styles.bigIcon, { backgroundColor: theme.colors.dangerSoft }]}>
            <MicOff size={36} color={theme.colors.danger} />
          </View>
          <Text variant="title" align="center">
            {pick(lang, 'Microphone is off', 'Mic band hai')}
          </Text>
          <Text variant="body" tone="secondary" align="center">
            {pick(
              lang,
              'To record a conversation, allow the microphone for this app in Settings.',
              'Conversation record karne ke liye Settings mein is app ka mic allow karo.',
            )}
          </Text>
        </View>
        <Button label={pick(lang, 'Open Settings', 'Settings kholo')} size="lg" fullWidth onPress={() => void Linking.openSettings()} />
      </View>
    );
  }

  if (screen === 'saved') {
    return (
      <View style={[styles.screen, padding, { backgroundColor: theme.colors.background }]}>
        <View style={styles.center}>
          <View style={[styles.bigIcon, { backgroundColor: theme.colors.successSoft }]}>
            <CheckCircle2 size={40} color={theme.colors.success} />
          </View>
          <Text variant="title" align="center">
            {pick(lang, 'Got it!', 'Ho gaya!')}
          </Text>
          <Text variant="body" tone="secondary" align="center">
            {savedOffline
              ? pick(
                  lang,
                  'No internet right now. It’s saved on your phone and I’ll process it as soon as you’re back online.',
                  'Abhi internet nahi hai. Phone mein save hai, net aate hi process kar dunga.',
                )
              : pick(
                  lang,
                  'I’m transcribing and summarising it now. You can leave the app, I’ll let you know when it’s ready.',
                  'Main ise likh raha hoon aur summary bana raha hoon. App band kar sakte ho, ready hote hi bata dunga.',
                )}
          </Text>
        </View>
        <Button label={pick(lang, 'Done', 'Theek hai')} size="lg" fullWidth onPress={close} />
      </View>
    );
  }

  // Recorder (also shown while starting).
  const interrupted = rec.phase === 'interrupted';
  const paused = rec.phase === 'paused' || interrupted;
  const stateLabel = interrupted
    ? pick(lang, 'Paused: the mic was taken (a call?)', 'Ruk gaya: mic kisi aur ne le liya (call?)')
    : paused
      ? pick(lang, 'Paused', 'Ruka hua')
      : rec.phase === 'recording'
        ? pick(lang, 'Recording', 'Record ho raha hai')
        : pick(lang, 'Starting…', 'Shuru ho raha hai…');

  const recording = rec.phase === 'recording';
  const level = rec.levels.length ? rec.levels[rec.levels.length - 1] : 0;
  const eventTitle = event.data?.title ?? null;

  return (
    <View style={[styles.screen, padding, { backgroundColor: theme.colors.background }]}>
      <View style={styles.topBar}>
        <IconButton icon={X} variant="tonal" accessibilityLabel="Close" onPress={() => void askClose()} />
        <Text variant="micro" tone="muted" style={styles.topTitle}>
          {notesMode ? pick(lang, 'QUICK NOTES', 'QUICK NOTES') : pick(lang, 'NEW RECORDING', 'NAYI RECORDING')}
        </Text>
        <View style={styles.topSpacer} />
      </View>

      <View style={[styles.titleField, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.pill }]}>
        <Pencil size={16} color={theme.colors.textMuted} />
        <TextInput
          value={title}
          onChangeText={onTitle}
          placeholder={eventTitle ?? pick(lang, 'Add a title (optional)', 'Title daalo (optional)')}
          placeholderTextColor={theme.colors.textMuted}
          selectionColor={theme.colors.primary}
          cursorColor={theme.colors.primary}
          maxLength={300}
          accessibilityLabel="Recording title"
          style={[styles.titleInput, theme.typography.callout, { color: theme.colors.text }]}
        />
      </View>

      {eventTitle ? (
        <View style={[styles.eventChip, { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.pill }]}>
          <CalendarDays size={14} color={theme.colors.primaryText} />
          <Text variant="caption" tone="brand" numberOfLines={1} style={styles.flex}>
            {pick(lang, `For: ${eventTitle}`, `Iske liye: ${eventTitle}`)}
          </Text>
        </View>
      ) : null}

      <View style={styles.center}>
        <RecordingOrb recording={recording} level={level} />
        {notesMode ? (
          <Text variant="callout" tone="secondary" align="center">
            {pick(
              lang,
              'Speak for about 30 seconds: what was decided, who does what, and by when.',
              'Lagbhag 30 second bolo: kya tay hua, kaun kya karega, aur kab tak.',
            )}
          </Text>
        ) : null}

        <View
          style={[
            styles.indicator,
            { backgroundColor: paused ? theme.colors.surfaceMuted : theme.colors.dangerSoft, borderRadius: theme.radii.pill },
          ]}
          accessibilityLiveRegion="polite"
        >
          <View style={[styles.dot, { backgroundColor: paused ? theme.colors.textMuted : theme.colors.danger }]} />
          <Text variant="label" tone={paused ? 'secondary' : 'danger'}>
            {stateLabel}
          </Text>
        </View>

        <Text style={[styles.timer, { color: theme.colors.text }]} accessibilityLabel={`Recorded ${formatClock(rec.elapsedMs)}`}>
          {formatClock(rec.elapsedMs)}
        </Text>

        <Waveform levels={rec.levels} active={recording} />

        {rec.bookmarks.length ? (
          <View style={styles.bookmarks}>
            {rec.bookmarks.slice(-3).map((b) => (
              <Chip key={b.atMs} icon={Bookmark} label={formatClock(b.atMs)} size="sm" tone="brand" />
            ))}
            {rec.bookmarks.length > 3 ? <Chip label={`+${rec.bookmarks.length - 3}`} size="sm" /> : null}
          </View>
        ) : null}

        {interrupted ? (
          <View style={[styles.banner, { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radii.lg }]}>
            <PhoneOff size={18} color={theme.colors.warning} />
            <Text variant="caption" style={styles.flex}>
              {pick(
                lang,
                'Paused because a call or another app used the mic. Everything so far is saved.',
                'Call ya doosre app ne mic le liya, isliye ruk gaya. Ab tak ka sab save hai.',
              )}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.dock, { backgroundColor: theme.colors.surface, borderRadius: 32 }, theme.elevation.card]}>
        <View style={styles.side}>
          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Bookmark this moment"
            disabled={!active || interrupted}
            onPress={() => void onBookmark()}
            style={[styles.sideButton, { backgroundColor: theme.colors.primarySoft, opacity: !active || interrupted ? 0.5 : 1 }]}
          >
            <Bookmark size={22} color={theme.colors.primaryText} />
          </Touchable>
          <Text variant="micro" tone="secondary">
            {pick(lang, 'Bookmark', 'Bookmark')}
          </Text>
        </View>
        <View style={styles.side}>
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Resume recording' : 'Pause recording'}
            disabled={!active}
            onPress={() => (paused ? void rec.resume() : rec.pause())}
            style={[styles.mainButton, { backgroundColor: theme.colors.primary, opacity: active ? 1 : 0.5 }, theme.elevation.card]}
          >
            {paused ? <Play size={32} color={theme.colors.primaryForeground} fill={theme.colors.primaryForeground} /> : <Pause size={32} color={theme.colors.primaryForeground} fill={theme.colors.primaryForeground} />}
          </Touchable>
          <Text variant="micro" tone="secondary">
            {paused ? pick(lang, 'Resume', 'Chalu karo') : pick(lang, 'Pause', 'Roko')}
          </Text>
        </View>
        <View style={styles.side}>
          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Stop and save"
            disabled={!active}
            onPress={() => void finish()}
            style={[styles.sideButton, { backgroundColor: theme.colors.dangerSoft, opacity: active ? 1 : 0.5 }]}
          >
            <Square size={20} color={theme.colors.danger} fill={theme.colors.danger} />
          </Touchable>
          <Text variant="micro" tone="secondary">
            {pick(lang, 'Save', 'Save')}
          </Text>
        </View>
      </View>

      <Touchable accessibilityRole="button" disabled={!active} onPress={confirmDelete} style={[styles.deleteLink, { opacity: active ? 1 : 0.5 }]}>
        <Trash2 size={14} color={theme.colors.danger} />
        <Text variant="caption" tone="danger">
          {pick(lang, 'Stop and delete', 'Roko aur delete karo')}
        </Text>
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitle: {
    letterSpacing: 1.5,
  },
  topSpacer: {
    width: 48,
  },
  eventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'center',
    maxWidth: '100%',
  },
  titleField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  titleInput: {
    flex: 1,
    paddingVertical: 10,
  },
  flex: {
    flex: 1,
  },
  bookmarks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'stretch',
  },
  // Bottom-aligned so the three labels sit on one line under buttons of different sizes.
  dock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  sideButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    alignSelf: 'center',
  },
  center: {
    flexGrow: 1,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 4,
  },
  bigIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  // Medium weight: very thin weights render broken digits on some Android OEM fonts.
  timer: {
    fontSize: 52,
    lineHeight: 60,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  side: {
    alignItems: 'center',
    gap: 6,
    width: 92,
  },
  mainButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
