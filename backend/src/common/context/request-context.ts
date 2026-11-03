import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface ContextStore {
  /** HTTP request id, or the correlation id carried by a job. */
  requestId: string;
  userId?: string;
  adminId?: string;
  jobId?: string;
  queue?: string;
}

const storage = new AsyncLocalStorage<ContextStore>();

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;

/** Accepts a client-supplied X-Request-Id only when it looks sane; otherwise generates a UUID. */
export function sanitizeRequestId(value: unknown): string {
  const v: unknown = Array.isArray(value) ? (value as unknown[])[0] : value;
  return typeof v === 'string' && REQUEST_ID_RE.test(v) ? v : randomUUID();
}

/**
 * Request/job scoped context (AsyncLocalStorage). Every log line picks up `requestId`/`correlationId`
 * through the pino mixin, and job producers copy it into job data as `correlationId`.
 */
export const RequestContext = {
  run<T>(store: ContextStore, fn: () => T): T {
    return storage.run(store, fn);
  },
  get(): ContextStore | undefined {
    return storage.getStore();
  },
  requestId(): string | undefined {
    return storage.getStore()?.requestId;
  },
  set(patch: Partial<ContextStore>): void {
    const store = storage.getStore();
    if (store) Object.assign(store, patch);
  },
};

/** Adds the current correlation id to a job payload. */
export function withCorrelation<T extends object>(data: T): T & { correlationId?: string } {
  const id = RequestContext.requestId();
  return id ? { ...data, correlationId: id } : data;
}
