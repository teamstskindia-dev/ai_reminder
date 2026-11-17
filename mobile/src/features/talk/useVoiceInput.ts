import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { reportError } from '@/utils/logger';

const OPTIONS: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64_000, isMeteringEnabled: true };
const MAX_MS = 60_000;
/** Speech is louder than this (dBFS)… */
const SPEECH_DB = -38;
/** …and silence quieter than this. */
const SILENCE_DB = -48;
/** Voice mode: stop after this much silence once the user has spoken. */
const SILENCE_MS = 1600;
/** Voice mode: give up when nothing was said for this long. */
const NO_SPEECH_MS = 8000;

export type VoiceInputState = 'idle' | 'recording';

/**
 * Microphone input for Talk: hold-to-speak (start on press, stop on release) and the hands-free voice mode
 * (`autoStop`: stops by itself after a pause in speech). `level` (0…1) drives the voice orb.
 */
export function useVoiceInput(opts: { autoStop?: boolean; onAutoStop?: (uri: string | null) => void } = {}) {
  const recorder = useAudioRecorder(OPTIONS);
  const [state, setState] = useState<VoiceInputState>('idle');
  const [level, setLevel] = useState(0);
  const startedAt = useRef(0);
  const heardSpeech = useRef(false);
  const quietSince = useRef<number | null>(null);
  const stopping = useRef(false);
  const onAutoStop = useRef(opts.onAutoStop);
  useEffect(() => {
    onAutoStop.current = opts.onAutoStop;
  });

  const start = useCallback(async (): Promise<'started' | 'denied' | 'error'> => {
    try {
      let permission = await getRecordingPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return 'denied';
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      heardSpeech.current = false;
      quietSince.current = null;
      stopping.current = false;
      setState('recording');
      return 'started';
    } catch (error) {
      reportError(error, { source: 'talk-voice-start' });
      setState('idle');
      return 'error';
    }
  }, [recorder]);

  /** Stops and returns the file (null when too short to be speech). */
  const stop = useCallback(async (): Promise<string | null> => {
    if (stopping.current) return null;
    stopping.current = true;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      const long = Date.now() - startedAt.current >= 600;
      return long ? recorder.uri : null;
    } catch (error) {
      reportError(error, { source: 'talk-voice-stop' });
      return null;
    } finally {
      setState('idle');
      setLevel(0);
    }
  }, [recorder]);

  useEffect(() => {
    if (state !== 'recording') return undefined;
    const timer = setInterval(() => {
      let db: number | undefined;
      try {
        db = recorder.getStatus().metering;
      } catch {
        return;
      }
      const now = Date.now();
      setLevel(typeof db === 'number' ? Math.min(1, Math.max(0, (db + 50) / 50)) : 0);
      const elapsed = now - startedAt.current;
      const limit = elapsed >= MAX_MS;
      let silent = false;
      if (opts.autoStop && typeof db === 'number') {
        if (db > SPEECH_DB) {
          heardSpeech.current = true;
          quietSince.current = null;
        } else if (db < SILENCE_DB) {
          quietSince.current ??= now;
        }
        silent =
          (heardSpeech.current && quietSince.current !== null && now - quietSince.current >= SILENCE_MS) ||
          (!heardSpeech.current && elapsed >= NO_SPEECH_MS);
      }
      if (limit || silent) {
        const spoke = heardSpeech.current || !opts.autoStop;
        void stop().then((uri) => onAutoStop.current?.(spoke ? uri : null));
      }
    }, 120);
    return () => clearInterval(timer);
  }, [state, recorder, stop, opts.autoStop]);

  return { state, level, start, stop };
}
