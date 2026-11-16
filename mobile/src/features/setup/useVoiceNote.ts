import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { reportError } from '@/utils/logger';

const MAX_SECONDS = 60;

export type VoiceState = 'idle' | 'recording' | 'denied';

/**
 * Tap-to-start / tap-to-stop voice note (max 60 s). Asks for the microphone only when the user first
 * taps the mic. `stop()` resolves to the local file URI (or null when nothing was captured).
 */
export function useVoiceNote(options: { onLimit: () => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<VoiceState>('idle');
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(0);
  const onLimitRef = useRef(options.onLimit);
  useEffect(() => {
    onLimitRef.current = options.onLimit;
  });

  useEffect(() => {
    if (state !== 'recording') return undefined;
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) {
        clearInterval(tick);
        onLimitRef.current();
      }
    }, 250);
    return () => clearInterval(tick);
  }, [state]);

  const start = useCallback(async (): Promise<boolean> => {
    try {
      let permission = await getRecordingPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setState('denied');
        return false;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      setSeconds(0);
      setState('recording');
      return true;
    } catch (error) {
      reportError(error, { source: 'voice-note-start' });
      setState('idle');
      return false;
    }
  }, [recorder]);

  const stop = useCallback(async (): Promise<string | null> => {
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      const tooShort = Date.now() - startedAt.current < 700;
      return tooShort ? null : recorder.uri;
    } catch (error) {
      reportError(error, { source: 'voice-note-stop' });
      return null;
    } finally {
      setState('idle');
    }
  }, [recorder]);

  return { state, seconds, maxSeconds: MAX_SECONDS, start, stop };
}
