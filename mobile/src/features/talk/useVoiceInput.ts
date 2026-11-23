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
export type VoiceStartResult = 'started' | 'denied' | 'error' | 'cancelled';

const isAlreadyPrepared = (error: unknown) =>
  /already been prepared/i.test(error instanceof Error ? error.message : String(error));

/**
 * Microphone input for Talk: hold-to-speak (start on press, stop on release) and the hands-free voice mode
 * (`autoStop`: stops by itself after a pause in speech). `level` (0…1) drives the voice orb.
 *
 * Starting takes a moment (permission check, preparing the recorder). A `stop()` that arrives during that
 * window cancels the start instead of being lost, so a quick tap never leaves the recorder running.
 */
export function useVoiceInput(opts: { autoStop?: boolean; onAutoStop?: (uri: string | null) => void } = {}) {
  const recorder = useAudioRecorder(OPTIONS);
  const [state, setState] = useState<VoiceInputState>('idle');
  const [level, setLevel] = useState(0);
  const startedAt = useRef(0);
  const heardSpeech = useRef(false);
  const quietSince = useRef<number | null>(null);
  /** The recorder is recording and has not been stopped yet. */
  const active = useRef(false);
  /** A start is in progress. */
  const starting = useRef(false);
  /** `stop()` was called while starting: abandon the start. */
  const cancelStart = useRef(false);
  const onAutoStop = useRef(opts.onAutoStop);
  useEffect(() => {
    onAutoStop.current = opts.onAutoStop;
  });

  const start = useCallback(async (): Promise<VoiceStartResult> => {
    if (starting.current || active.current) return 'error';
    starting.current = true;
    cancelStart.current = false;
    try {
      let permission = await getRecordingPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return 'denied';
      if (cancelStart.current) return 'cancelled';
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      // A session left over from an interrupted press: stop it so this one can start cleanly.
      try {
        if (recorder.getStatus().isRecording) await recorder.stop();
      } catch {
        // Nothing to stop.
      }
      try {
        await recorder.prepareToRecordAsync();
      } catch (error) {
        // Prepared earlier but never recorded: reuse that session.
        if (!isAlreadyPrepared(error)) throw error;
      }
      if (cancelStart.current) {
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        return 'cancelled';
      }
      recorder.record();
      startedAt.current = Date.now();
      heardSpeech.current = false;
      quietSince.current = null;
      active.current = true;
      setState('recording');
      return 'started';
    } catch (error) {
      reportError(error, { source: 'talk-voice-start' });
      setState('idle');
      return 'error';
    } finally {
      starting.current = false;
    }
  }, [recorder]);

  /** Stops and returns the file (null when too short to be speech, or when nothing was recording). */
  const stop = useCallback(async (): Promise<string | null> => {
    if (starting.current) {
      cancelStart.current = true;
      return null;
    }
    if (!active.current) return null;
    active.current = false;
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
