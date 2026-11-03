type Listener<T> = (payload: T) => void;

export interface Emitter<T> {
  emit(payload: T): void;
  subscribe(listener: Listener<T>): () => void;
}

/** A tiny synchronous pub/sub used to bridge non-React modules (API client) and providers. */
export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<Listener<T>>();
  return {
    emit(payload) {
      for (const listener of Array.from(listeners)) listener(payload);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
