import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { ApiError } from '@/api/errors';
import { qk } from '@/api/queryKeys';
import { queryClient } from '@/api/queryClient';
import { createCapture, fetchCapture, finishCapture, uploadCapturePart } from '@/api/resources/captures';
import { getAccessToken } from '@/api/tokens';
import { createEmitter } from '@/utils/emitter';
import { reportError } from '@/utils/logger';
import { toast } from '@/utils/toast';

import { getActiveRecording } from './activeRecording';
import { loadCaptures, partExists, removeCapture, upsertCapture, type LocalCapture } from './captureStore';

/** Shorter recordings are "nothing to process" (matches the server's minimum). */
export const MIN_CAPTURE_MS = 1500;

/** Fired when a recording reached the server (clientId → server id). */
export const captureSent = createEmitter<{ clientId: string; captureId: string }>();

let running = false;
let again = false;

/** Waits longer after each failed attempt: 15 s, 30 s, 1 min … up to 10 minutes. */
function isDue(c: LocalCapture): boolean {
  if (c.state !== 'failed') return true;
  if (c.permanent) return false;
  const wait = Math.min(15_000 * 2 ** Math.max(0, c.attempts - 1), 10 * 60_000);
  return Date.now() - new Date(c.updatedAt).getTime() >= wait;
}

/** Errors that retrying will never fix (the request itself is wrong). */
function isPermanent(error: unknown): boolean {
  return error instanceof ApiError && [400, 404, 413, 415, 422].includes(error.status);
}

async function sendOne(initial: LocalCapture): Promise<void> {
  let c: LocalCapture = { ...initial, state: 'uploading', lastError: null };
  await upsertCapture(c);
  try {
    if (!c.serverId) {
      const created = await createCapture({
        clientId: c.clientId,
        startedAt: c.startedAt,
        title: c.title || undefined,
        meetingId: c.linkedMeetingId ?? undefined,
      });
      c = { ...c, serverId: created.id };
      await upsertCapture(c);
    }
    const serverId = c.serverId as string;
    const parts = [...c.parts].sort((a, b) => a.index - b.index);
    for (const part of parts) {
      if (part.uploaded) continue;
      if (!partExists(part.uri)) throw new Error(`Part ${part.index + 1} of the recording is missing on this phone`);
      await uploadCapturePart(serverId, part.index, part);
      c = { ...c, parts: c.parts.map((p) => (p.index === part.index ? { ...p, uploaded: true } : p)) };
      await upsertCapture(c);
    }
    await finishCapture(serverId, {
      partCount: parts.length,
      durationMs: Math.round(c.durationMs),
      title: c.title || undefined,
      bookmarks: c.bookmarks,
    });
    await removeCapture(c.clientId);
    captureSent.emit({ clientId: c.clientId, captureId: serverId });
    void queryClient.invalidateQueries({ queryKey: qk.captures.all });
  } catch (error) {
    // A 409 can mean another attempt already finished it: then the server has it and we are done.
    if (error instanceof ApiError && error.status === 409 && c.serverId) {
      const remote = await fetchCapture(c.serverId).catch(() => null);
      if (remote && remote.status !== 'uploading') {
        await removeCapture(c.clientId);
        captureSent.emit({ clientId: c.clientId, captureId: remote.id });
        void queryClient.invalidateQueries({ queryKey: qk.captures.all });
        return;
      }
    }
    const message = error instanceof Error ? error.message : 'Upload failed';
    const permanent = isPermanent(error) || (error instanceof Error && /missing on this phone/.test(message));
    if (!(error instanceof ApiError && (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT'))) {
      reportError(error, { source: 'capture-upload', permanent });
    }
    await upsertCapture({ ...c, state: 'failed', attempts: c.attempts + 1, lastError: message, permanent });
  }
}

async function runOnce(): Promise<void> {
  const net = await NetInfo.fetch();
  if (net.isConnected === false) return;
  if (!(await getAccessToken())) return;
  const active = getActiveRecording();
  const pending = (await loadCaptures()).filter(
    (c) => c.clientId !== active && (c.state === 'queued' || c.state === 'uploading' || c.state === 'failed') && isDue(c),
  );
  for (const c of pending) await sendOne(c);
}

/** Sends every recording waiting on the phone. Safe to call often; runs one pass at a time. */
export async function processCaptureQueue(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await runOnce();
    } while (again);
  } catch (error) {
    reportError(error, { source: 'capture-queue' });
  } finally {
    running = false;
  }
}

/** Sends a recording again now (a failed one, from the Today card). */
export async function retryLocalCapture(clientId: string): Promise<void> {
  const c = (await loadCaptures()).find((x) => x.clientId === clientId);
  if (!c) return;
  await upsertCapture({ ...c, state: 'queued', permanent: false, attempts: 0 });
  await processCaptureQueue();
}

/**
 * After a crash, an app kill or a dead battery the recording that was in progress is still marked
 * "recording": keep the parts that were saved and send them (the unfinished last part is lost).
 */
async function recoverInterrupted(): Promise<void> {
  const active = getActiveRecording();
  const stuck = (await loadCaptures()).filter((c) => c.state === 'recording' && c.clientId !== active);
  for (const c of stuck) {
    const parts = c.parts.filter((p) => partExists(p.uri));
    const durationMs = parts.reduce((sum, p) => sum + p.durationMs, 0);
    if (!parts.length || durationMs < MIN_CAPTURE_MS) {
      await removeCapture(c.clientId);
      continue;
    }
    await upsertCapture({ ...c, parts, durationMs, state: 'queued' });
    const minutes = Math.max(1, Math.round(durationMs / 60_000));
    toast(`Saved ${minutes} min of your last recording. Sending it now.`);
  }
}

/** Keeps the upload queue moving while signed in: on start, when back online, on resume, every minute. */
export function useCaptureUploader(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn) return undefined;
    void recoverInterrupted().then(processCaptureQueue);
    const offNet = NetInfo.addEventListener((state) => {
      if (state.isConnected) void processCaptureQueue();
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void processCaptureQueue();
    });
    const timer = setInterval(() => void processCaptureQueue(), 60_000);
    return () => {
      offNet();
      appState.remove();
      clearInterval(timer);
    };
  }, [signedIn]);
}
