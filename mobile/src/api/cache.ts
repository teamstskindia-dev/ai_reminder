import type { QueryClient, QueryKey } from '@tanstack/react-query';

type Snapshot = [QueryKey, unknown][];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Structurally-shared deep update: every object whose `id` equals `id` is shallow-merged with `patch`.
 * Works for plain lists, paginated `{ items }`, infinite `{ pages }` and aggregates like DashboardHome.
 */
export function deepPatch(value: unknown, id: string, patch: Record<string, unknown>): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const updated = deepPatch(item, id, patch);
      if (updated !== item) changed = true;
      return updated;
    });
    return changed ? next : value;
  }
  if (isPlainObject(value)) {
    if (value.id === id) return { ...value, ...patch };
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const updated = deepPatch(child, id, patch);
      if (updated !== child) changed = true;
      next[key] = updated;
    }
    return changed ? next : value;
  }
  return value;
}

/** Removes every array element whose `id` equals `id`. */
export function deepRemove(value: unknown, id: string): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next: unknown[] = [];
    for (const item of value) {
      if (isPlainObject(item) && item.id === id) {
        changed = true;
        continue;
      }
      const updated = deepRemove(item, id);
      if (updated !== item) changed = true;
      next.push(updated);
    }
    return changed ? next : value;
  }
  if (isPlainObject(value)) {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const updated = deepRemove(child, id);
      if (updated !== child) changed = true;
      next[key] = updated;
    }
    return changed ? next : value;
  }
  return value;
}

async function updateCaches(
  qc: QueryClient,
  prefixes: readonly QueryKey[],
  updater: (data: unknown) => unknown,
): Promise<Snapshot> {
  const snapshot: Snapshot = [];
  const seen = new Set<string>();
  for (const queryKey of prefixes) {
    await qc.cancelQueries({ queryKey });
    for (const [key, data] of qc.getQueriesData({ queryKey })) {
      const hash = JSON.stringify(key);
      if (data === undefined || seen.has(hash)) continue;
      seen.add(hash);
      snapshot.push([key, data]);
      qc.setQueryData(key, updater(data));
    }
  }
  return snapshot;
}

/** Optimistically patch an entity in every cached query under the given key prefixes. */
export function patchEntity(
  qc: QueryClient,
  prefixes: readonly QueryKey[],
  id: string,
  patch: Record<string, unknown>,
): Promise<Snapshot> {
  return updateCaches(qc, prefixes, (data) => deepPatch(data, id, patch));
}

/** Optimistically remove an entity from every cached query under the given key prefixes. */
export function removeEntity(qc: QueryClient, prefixes: readonly QueryKey[], id: string): Promise<Snapshot> {
  return updateCaches(qc, prefixes, (data) => deepRemove(data, id));
}

export function restoreSnapshot(qc: QueryClient, snapshot: Snapshot | undefined): void {
  if (!snapshot) return;
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}

function deepFind(value: unknown, id: string, accept: (candidate: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFind(item, id, accept);
      if (found) return found;
    }
    return null;
  }
  if (isPlainObject(value)) {
    if (value.id === id && accept(value)) return value;
    for (const child of Object.values(value)) {
      const found = deepFind(child, id, accept);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Finds an entity by id anywhere in the cached queries under `prefixes` (used by edit forms, since the
 * contract has no GET-by-id for reminders and action items). `accept` narrows the shape.
 */
export function findCachedEntity<T>(
  qc: QueryClient,
  prefixes: readonly QueryKey[],
  id: string,
  accept: (candidate: Record<string, unknown>) => boolean,
): T | null {
  for (const queryKey of prefixes) {
    for (const [, data] of qc.getQueriesData({ queryKey })) {
      const found = deepFind(data, id, accept);
      if (found) return found as T;
    }
  }
  return null;
}
