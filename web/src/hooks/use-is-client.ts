"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** `false` during SSR / prerender and hydration, `true` afterwards. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
