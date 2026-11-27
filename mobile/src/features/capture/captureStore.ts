import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';

import type { CaptureBookmark } from '@/api/types';
import { createEmitter } from '@/utils/emitter';
import { reportError } from '@/utils/logger';
import { readJson, writeJson } from '@/utils/storage';

/**
 * Recordings that live on the phone until the server has them: the one being recorded (persisted after
 * every part so a crash or a dead battery loses at most the current part) and the ones waiting in the
 * upload queue (offline, or still sending). Parts are moved out of the cache into the app's documents
 * folder so the OS never clears them. A recording leaves this store once the server has it.
 */

export interface LocalPart {
  index: number;
  uri: string;
  durationMs: number;
  uploaded: boolean;
}

export type LocalCaptureState = 'recording' | 'queued' | 'uploading' | 'failed';

export interface LocalCapture {
  clientId: string;
  title: string;
  startedAt: string;
  /** Recorded time so far, pauses excluded. */
  durationMs: number;
  bookmarks: CaptureBookmark[];
  parts: LocalPart[];
  state: LocalCaptureState;
  /** Set once POST /captures succeeded. */
  serverId: string | null;
  /** The calendar meeting this recording belongs to (record prompt, quick notes). */
  linkedMeetingId?: string | null;
  /**
   * The signed-in user who recorded it. Only that user's session ever uploads or shows it, so a recording made
   * offline by one account is never sent into another account that signs in later on the same phone.
   * Missing on recordings saved by older app versions (claimed by the first account that sends them).
   */
  ownerId?: string | null;
  attempts: number;
  lastError: string | null;
  /** A permanent problem (the server refused it); retrying will not help. */
  permanent: boolean;
  /**
   * The plan's monthly audio minutes are used up. The recording stays on the phone: it is retried every few
   * hours (it goes through once the new month starts) or right away from "Try now" after upgrading.
   */
  planLimited?: boolean;
  updatedAt: string;
}

const KEY = 'remi.captures.v1';
const changes = createEmitter<LocalCapture[]>();
let cache: LocalCapture[] | null = null;
let writing: Promise<void> = Promise.resolve();

export async function loadCaptures(): Promise<LocalCapture[]> {
  if (!cache) cache = (await readJson<LocalCapture[]>(KEY)) ?? [];
  return cache;
}

function persist(next: LocalCapture[]): Promise<void> {
  cache = next;
  changes.emit(next);
  // Writes are chained so an older snapshot never lands after a newer one.
  writing = writing.then(() => writeJson(KEY, next));
  return writing;
}

export async function upsertCapture(capture: LocalCapture): Promise<void> {
  const all = await loadCaptures();
  const updated = { ...capture, updatedAt: new Date().toISOString() };
  const exists = all.some((c) => c.clientId === capture.clientId);
  await persist(exists ? all.map((c) => (c.clientId === capture.clientId ? updated : c)) : [...all, updated]);
}

export async function getCapture(clientId: string): Promise<LocalCapture | null> {
  return (await loadCaptures()).find((c) => c.clientId === clientId) ?? null;
}

/** Forgets a recording and deletes its audio from the phone. */
export async function removeCapture(clientId: string): Promise<void> {
  const all = await loadCaptures();
  deleteCaptureFiles(clientId);
  await persist(all.filter((c) => c.clientId !== clientId));
}

function captureDir(clientId: string): Directory {
  return new Directory(Paths.document, 'captures', clientId);
}

/** Moves a finished part from the recorder's cache file into the recording's own folder. */
export function keepPart(clientId: string, index: number, tempUri: string): string {
  const dir = captureDir(clientId);
  dir.create({ intermediates: true, idempotent: true });
  const ext = tempUri.split('.').pop()?.toLowerCase() || 'm4a';
  const target = new File(dir, `part-${String(index).padStart(3, '0')}.${ext}`);
  if (target.exists) target.delete();
  const source = new File(tempUri);
  source.moveSync(target);
  return target.uri;
}

/** Deletes a temporary recorder file (a discarded or unfinished part). Never throws. */
export function deleteFile(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (error) {
    reportError(error, { source: 'capture-delete-file' });
  }
}

export function partExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

function deleteCaptureFiles(clientId: string): void {
  try {
    const dir = captureDir(clientId);
    if (dir.exists) dir.delete();
  } catch (error) {
    reportError(error, { source: 'capture-delete-dir' });
  }
}

/** True when the recording belongs to this user (or predates owner tracking). */
export function belongsTo(capture: Pick<LocalCapture, 'ownerId'>, userId: string | null | undefined): boolean {
  if (!userId) return false;
  return !capture.ownerId || capture.ownerId === userId;
}

/**
 * The parts that can be sent as one recording: 0, 1, 2… up to the first gap. The server requires parts
 * 0..partCount-1, so a gap (a file lost in a crash) would otherwise fail every attempt to finish.
 */
export function contiguousParts(parts: LocalPart[]): LocalPart[] {
  const sorted = [...parts].sort((a, b) => a.index - b.index);
  const out: LocalPart[] = [];
  for (const part of sorted) {
    if (part.index !== out.length) break;
    out.push(part);
  }
  return out;
}

/** Live list of recordings still on the phone (newest first). */
export function useLocalCaptures(): LocalCapture[] {
  const [list, setList] = useState<LocalCapture[]>(() => cache ?? []);
  useEffect(() => {
    let alive = true;
    void loadCaptures().then((all) => alive && setList(all));
    const off = changes.subscribe((all) => setList(all));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Idempotency key for POST /captures, created when recording starts. */
export function newClientId(): string {
  return randomUUID();
}
