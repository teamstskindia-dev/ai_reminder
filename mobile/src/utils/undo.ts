import { useSyncExternalStore } from 'react';

import { logger } from './logger';

/**
 * "Undo available for a short time" (user-flow §10): a delete is only sent to the server after a few seconds,
 * while a bar offers Undo. Undo cancels it, so nothing was ever deleted. One pending action at a time: a new
 * one commits the previous right away.
 */

export interface UndoAction {
  message: string;
  /** Runs when the time is up (the real delete). */
  commit: () => Promise<unknown> | unknown;
  /** Runs when the user taps Undo (restore what the screen hid). */
  onUndo?: () => void;
  /** Runs if the commit fails (restore and tell the user). */
  onError?: (error: unknown) => void;
  ms?: number;
}

interface Pending extends UndoAction {
  id: number;
  timer: ReturnType<typeof setTimeout>;
}

let pending: Pending | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

async function run(action: Pending) {
  try {
    await action.commit();
  } catch (error) {
    logger.warn('Undoable action failed', { message: action.message });
    action.onError?.(error);
  }
}

function settle(): Pending | null {
  const current = pending;
  if (current) clearTimeout(current.timer);
  pending = null;
  emit();
  return current;
}

export function undoable(action: UndoAction): void {
  const previous = settle();
  if (previous) void run(previous);
  const id = nextId++;
  const timer = setTimeout(() => {
    if (pending?.id !== id) return;
    const done = settle();
    if (done) void run(done);
  }, action.ms ?? 6000);
  pending = { ...action, id, timer };
  emit();
}

export function undoPending(): void {
  const current = settle();
  current?.onUndo?.();
}

/** Commits now (e.g. the user dismissed the bar). */
export function commitPending(): void {
  const current = settle();
  if (current) void run(current);
}

export function useUndoState(): { message: string } | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => pending,
    () => pending,
  );
}
