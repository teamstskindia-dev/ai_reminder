import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CaptureBookmark } from '@/api/types';
import { useAuth } from '@/providers/AuthProvider';
import { haptics } from '@/utils/haptics';
import { reportError } from '@/utils/logger';

import { setActiveRecording } from './activeRecording';
import { deleteFile, keepPart, newClientId, removeCapture, upsertCapture, type LocalCapture } from './captureStore';
import { MIN_CAPTURE_MS, processCaptureQueue } from './uploadQueue';

/** Each part is finalised (a complete, playable file) after this much recorded time. */
export const PART_MS = 5 * 60_000;
/** "Still recording?" every 90 minutes. */
export const CHECK_IN_EVERY_MS = 90 * 60_000;
/** Hard stop. */
export const MAX_RECORDING_MS = 4 * 3600_000;
/** How many level bars the waveform keeps. */
const LEVELS = 48;
/** The mic must stay silent this long before we call it an interruption (a call, another app). */
const INTERRUPTION_GRACE_MS = 1500;

/** Speech-friendly: mono, 64 kbps AAC in .m4a (about 2.4 MB per 5-minute part). */
const OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64_000,
  isMeteringEnabled: true,
};

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'paused' | 'interrupted' | 'stopping' | 'done';
export type StartResult = 'started' | 'denied' | 'blocked' | 'error';
export type StopResult = { kind: 'queued'; clientId: string; durationMs: number } | { kind: 'too_short' } | { kind: 'error' };

/** dBFS (-160…0) → 0…1 for the waveform. */
function toLevel(db: number | undefined): number {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0.04;
  return Math.min(1, Math.max(0.04, (db + 50) / 50));
}

/**
 * Tap-to-record engine (user-flow §04). Records in parts of PART_MS so a crash, an app kill or a dead
 * battery loses at most the current part: each finished part is moved to the app's documents folder and
 * the session is persisted (see captureStore). Detects interruptions (the mic stops delivering while we
 * think we are recording, e.g. a phone call) and pauses; resuming starts a fresh part.
 */
export function useCaptureRecorder(options: { onCheckIn: () => void }) {
  const recorder = useAudioRecorder(OPTIONS);
  /** Stamped on the recording so only this account ever sends or shows it. */
  const ownerId = useAuth().user?.id;
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [bookmarks, setBookmarks] = useState<CaptureBookmark[]>([]);

  const phaseRef = useRef<RecorderPhase>('idle');
  const session = useRef<LocalCapture | null>(null);
  /** Date.now() when the current running stretch began (0 while paused). */
  const runningSince = useRef(0);
  /** Recorded ms in the current part before the running stretch. */
  const partMs = useRef(0);
  /** Recorded ms in finished parts. */
  const doneMs = useRef(0);
  const busy = useRef(false);
  const silentSince = useRef<number | null>(null);
  const nextCheckIn = useRef(CHECK_IN_EVERY_MS);
  const onCheckIn = useRef(options.onCheckIn);
  useEffect(() => {
    onCheckIn.current = options.onCheckIn;
  });

  const go = (next: RecorderPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  // Read refs only, so they are stable for the hooks below.
  const currentPartMs = useCallback(
    () => partMs.current + (runningSince.current ? Date.now() - runningSince.current : 0),
    [],
  );
  const totalMs = useCallback(() => doneMs.current + currentPartMs(), [currentPartMs]);

  const save = useCallback(async (patch: Partial<LocalCapture>) => {
    if (!session.current) return;
    session.current = { ...session.current, ...patch };
    await upsertCapture(session.current);
  }, []);

  /** Stops the recorder and keeps what it wrote as the next part (if anything was recorded). */
  const closePart = useCallback(async (): Promise<void> => {
    const s = session.current;
    if (!s) return;
    const ms = currentPartMs();
    runningSince.current = 0;
    partMs.current = 0;
    try {
      await recorder.stop();
    } catch (error) {
      reportError(error, { source: 'capture-stop-part' });
    }
    const uri = recorder.uri;
    if (!uri) return;
    if (ms < 300) {
      deleteFile(uri);
      return;
    }
    const index = s.parts.length;
    try {
      const kept = keepPart(s.clientId, index, uri);
      doneMs.current += ms;
      await save({ parts: [...s.parts, { index, uri: kept, durationMs: ms, uploaded: false }], durationMs: doneMs.current });
    } catch (error) {
      reportError(error, { source: 'capture-keep-part' });
    }
    // recorder.uri is read synchronously above; nothing else holds a reference to the temp file.
  }, [recorder, save, currentPartMs]);

  const openPart = useCallback(async (): Promise<void> => {
    await recorder.prepareToRecordAsync();
    recorder.record();
    runningSince.current = Date.now();
    silentSince.current = null;
  }, [recorder]);

  const start = useCallback(
    async (title: string, linkedMeetingId?: string | null): Promise<StartResult> => {
      if (phaseRef.current !== 'idle') return 'started';
      go('starting');
      try {
        let permission = await getRecordingPermissionsAsync();
        if (!permission.granted && permission.canAskAgain) permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          go('idle');
          return permission.canAskAgain ? 'denied' : 'blocked';
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true });
        const clientId = newClientId();
        session.current = {
          clientId,
          title: title.trim(),
          startedAt: new Date().toISOString(),
          durationMs: 0,
          bookmarks: [],
          parts: [],
          state: 'recording',
          serverId: null,
          linkedMeetingId: linkedMeetingId ?? null,
          ownerId: ownerId ?? null,
          attempts: 0,
          lastError: null,
          permanent: false,
          updatedAt: new Date().toISOString(),
        };
        setActiveRecording(clientId);
        await upsertCapture(session.current);
        doneMs.current = 0;
        partMs.current = 0;
        nextCheckIn.current = CHECK_IN_EVERY_MS;
        await openPart();
        haptics.success();
        go('recording');
        return 'started';
      } catch (error) {
        reportError(error, { source: 'capture-start' });
        if (session.current) await removeCapture(session.current.clientId);
        session.current = null;
        setActiveRecording(null);
        go('idle');
        return 'error';
      }
    },
    [openPart, ownerId],
  );

  const pause = useCallback(() => {
    if (phaseRef.current !== 'recording' || busy.current) return;
    try {
      recorder.pause();
    } catch (error) {
      reportError(error, { source: 'capture-pause' });
    }
    partMs.current = currentPartMs();
    runningSince.current = 0;
    haptics.light();
    go('paused');
  }, [recorder, currentPartMs]);

  const resume = useCallback(async () => {
    const from = phaseRef.current;
    if ((from !== 'paused' && from !== 'interrupted') || busy.current) return;
    busy.current = true;
    try {
      if (from === 'interrupted') {
        // After an interruption the recorder may be unusable: close the part and start a fresh one.
        await closePart();
        await openPart();
      } else {
        recorder.record();
        runningSince.current = Date.now();
        silentSince.current = null;
      }
      haptics.light();
      go('recording');
    } catch (error) {
      reportError(error, { source: 'capture-resume' });
    } finally {
      busy.current = false;
    }
  }, [closePart, openPart, recorder]);

  const bookmark = useCallback(async (): Promise<number | null> => {
    if (!session.current || (phaseRef.current !== 'recording' && phaseRef.current !== 'paused')) return null;
    const atMs = Math.round(totalMs());
    const next = [...session.current.bookmarks, { atMs, label: null }];
    setBookmarks(next);
    haptics.light();
    await save({ bookmarks: next });
    return atMs;
  }, [save, totalMs]);

  const setTitle = useCallback(
    (title: string) => {
      void save({ title: title.slice(0, 300) });
    },
    [save],
  );

  const finishAudioSession = () => {
    setActiveRecording(null);
    void setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false }).catch(() => undefined);
  };

  /** Stops, keeps the last part and queues the recording for upload. */
  const stop = useCallback(async (): Promise<StopResult> => {
    const s = session.current;
    if (!s || phaseRef.current === 'stopping' || phaseRef.current === 'done' || phaseRef.current === 'idle') {
      return { kind: 'error' };
    }
    go('stopping');
    busy.current = true;
    try {
      await closePart();
      const final = session.current as LocalCapture;
      const durationMs = Math.round(doneMs.current);
      if (durationMs < MIN_CAPTURE_MS || !final.parts.length) {
        await removeCapture(final.clientId);
        return { kind: 'too_short' };
      }
      await save({ state: 'queued', durationMs });
      void processCaptureQueue();
      haptics.success();
      return { kind: 'queued', clientId: final.clientId, durationMs };
    } catch (error) {
      reportError(error, { source: 'capture-stop' });
      return { kind: 'error' };
    } finally {
      busy.current = false;
      session.current = null;
      finishAudioSession();
      go('done');
    }
  }, [closePart, save]);

  /** "Someone asked not to record": stop and delete everything, nothing is uploaded. */
  const discard = useCallback(async (): Promise<void> => {
    const s = session.current;
    go('stopping');
    try {
      await recorder.stop();
    } catch {
      // already stopped
    }
    deleteFile(recorder.uri);
    if (s) await removeCapture(s.clientId);
    session.current = null;
    finishAudioSession();
    go('done');
  }, [recorder]);

  // Clock, waveform, part rotation, interruption detection, check-in and the hard limit.
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused' && phase !== 'interrupted') return undefined;
    const timer = setInterval(() => {
      setElapsedMs(totalMs());
      if (phaseRef.current !== 'recording' || busy.current) return;

      let status;
      try {
        status = recorder.getStatus();
      } catch {
        return;
      }
      setLevels((prev) => [...prev.slice(-(LEVELS - 1)), toLevel(status.metering)]);

      const now = Date.now();
      if (!status.isRecording) {
        silentSince.current ??= now;
        if (now - silentSince.current > INTERRUPTION_GRACE_MS) {
          // Count only the time the mic really delivered.
          partMs.current += Math.max(0, silentSince.current - runningSince.current);
          runningSince.current = 0;
          haptics.warning();
          go('interrupted');
        }
        return;
      }
      silentSince.current = null;

      if (totalMs() >= MAX_RECORDING_MS) {
        void stop();
        return;
      }
      if (totalMs() >= nextCheckIn.current) {
        nextCheckIn.current += CHECK_IN_EVERY_MS;
        onCheckIn.current();
      }
      if (currentPartMs() >= PART_MS) {
        busy.current = true;
        void closePart()
          .then(openPart)
          .catch((error: unknown) => {
            reportError(error, { source: 'capture-rotate' });
            partMs.current = 0;
            runningSince.current = 0;
            go('interrupted');
          })
          .finally(() => {
            busy.current = false;
          });
      }
    }, 120);
    return () => clearInterval(timer);
  }, [phase, recorder, closePart, openPart, stop, totalMs, currentPartMs]);

  return { phase, elapsedMs, levels, bookmarks, start, pause, resume, bookmark, setTitle, stop, discard };
}
