import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/**
 * A shared "current time" store ticking every 30 s (and when the app returns to the foreground).
 * Components read time through this hook instead of calling Date.now() during render.
 */
const TICK_MS = 30_000;
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;

function emit() {
  now = Date.now();
  for (const listener of Array.from(listeners)) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(emit, TICK_MS);
    appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') emit();
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      appStateSub?.remove();
      appStateSub = null;
    }
  };
}

function getSnapshot() {
  return now;
}

/** Current time in ms, refreshed every 30 seconds. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
