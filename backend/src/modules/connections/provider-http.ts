import { callExternal, type Provider } from '../../infra/external/external-call';

/**
 * A 4xx answer from a connected app (Gmail, Outlook, Notion, Jira, Linear, Todoist). Thrown as-is (never
 * retried): 401 means the access token is no longer valid, 403 a missing permission, 404 a deleted item.
 */
export class ProviderHttpError extends Error {
  constructor(
    readonly provider: Provider,
    readonly status: number,
    /** Provider error code when it sends one (invalid_grant, unauthorized, ...). Never the body itself. */
    readonly code: string | null,
  ) {
    super(`${provider} answered ${status}${code ? ` (${code})` : ''}`);
    this.name = 'ProviderHttpError';
  }

  get isAuth(): boolean {
    return this.status === 401 || this.code === 'invalid_grant' || this.code === 'unauthorized_client';
  }
}

export interface HttpJsonOptions {
  provider: Provider;
  operation: string;
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Bearer token. */
  token?: string;
  headers?: Record<string, string>;
  /** JSON body, or form fields (URLSearchParams). */
  body?: unknown;
  /** Extra attempts for network / 429 / 5xx. Use 0 for calls that create something. */
  retries?: number;
  timeoutMs?: number;
}

function errorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { error?: unknown; code?: unknown; errors?: { extensions?: { code?: unknown } }[] };
  if (typeof b.error === 'string') return b.error.slice(0, 60);
  if (b.error && typeof b.error === 'object' && typeof (b.error as { code?: unknown }).code === 'string') {
    return String((b.error as { code: string }).code).slice(0, 60);
  }
  if (typeof b.code === 'string') return b.code.slice(0, 60);
  const gql = b.errors?.[0]?.extensions?.code;
  return typeof gql === 'string' ? gql.slice(0, 60) : null;
}

/** fetch + JSON for connected-app APIs, with the usual timeout / retry / logging of external calls. */
export async function httpJson<T>(opts: HttpJsonOptions): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: string | undefined;
  if (opts.body instanceof URLSearchParams) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = opts.body.toString();
  } else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return callExternal(
    {
      provider: opts.provider,
      operation: opts.operation,
      retries: opts.retries ?? 2,
      timeoutMs: opts.timeoutMs ?? 20_000,
      passThrough: (err) => err instanceof ProviderHttpError,
    },
    async (signal) => {
      const res = await fetch(opts.url, { method: opts.method ?? 'GET', headers, body, signal });
      const text = await res.text();
      let json: unknown = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        throw new ProviderHttpError(opts.provider, res.status, errorCode(json));
      }
      if (!res.ok) {
        const err = new Error(`${opts.provider} ${opts.operation} failed with ${res.status}`) as Error & {
          status: number;
        };
        err.status = res.status;
        throw err;
      }
      // GraphQL reports auth failures inside a 200.
      const gqlCode = errorCode(json);
      if (json && typeof json === 'object' && Array.isArray((json as { errors?: unknown }).errors) && gqlCode) {
        throw new ProviderHttpError(opts.provider, /AUTH/i.test(gqlCode) ? 401 : 400, gqlCode);
      }
      return json as T;
    },
  );
}

export function basicAuth(id: string, secret: string): string {
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}
