import type { ConnectedProvider, EmailProvider, ToolProvider } from '../../common/types/api.types';
import type { Provider } from '../../infra/external/external-call';
import { basicAuth, httpJson } from './provider-http';

/**
 * OAuth for connected apps (user-flow §07 email, §08 tools): consent URL, code exchange, token refresh and
 * "who is this account". Plain fetch for every provider so they all behave the same (timeouts, retries,
 * logging without tokens or bodies).
 */

export const EMAIL_PROVIDERS: EmailProvider[] = ['gmail', 'outlook'];
export const TOOL_PROVIDERS: ToolProvider[] = ['notion', 'jira', 'linear', 'todoist'];
export const CONNECTED_PROVIDERS: ConnectedProvider[] = [...EMAIL_PROVIDERS, ...TOOL_PROVIDERS];

export const PROVIDER_NAME: Record<ConnectedProvider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  notion: 'Notion',
  jira: 'Jira',
  linear: 'Linear',
  todoist: 'Todoist',
};

/** Which external-call provider label each connected app logs under. */
export const HTTP_PROVIDER: Record<ConnectedProvider, Provider> = {
  gmail: 'google',
  outlook: 'microsoft',
  notion: 'notion',
  jira: 'atlassian',
  linear: 'linear',
  todoist: 'todoist',
};

export function isEmailProvider(p: string): p is EmailProvider {
  return (EMAIL_PROVIDERS as string[]).includes(p);
}

export function isToolProvider(p: string): p is ToolProvider {
  return (TOOL_PROVIDERS as string[]).includes(p);
}

export function isConnectedProvider(p: string): p is ConnectedProvider {
  return (CONNECTED_PROVIDERS as string[]).includes(p);
}

export const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const NOTION_VERSION = '2022-06-28';

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

/** 'read': read the inbox only; 'send': also send replies the user approved. Tools ignore it. */
export type ConnectMode = 'read' | 'send';

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  raw: Record<string, unknown>;
}

export interface AccountIdentity {
  label: string | null;
  externalId: string | null;
  /** Merged into connected_accounts.settings (canSend, cloudId, siteUrl, viewerId …). */
  settings: Record<string, unknown>;
}

/** PKCE is used where the provider supports it with a confidential client. */
export function supportsPkce(provider: ConnectedProvider): boolean {
  return provider === 'gmail' || provider === 'outlook';
}

function microsoftBase(tenant: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant || 'common')}/oauth2/v2.0`;
}

function outlookScopes(mode: ConnectMode): string {
  return [
    'offline_access',
    'openid',
    'email',
    'User.Read',
    'Mail.Read',
    ...(mode === 'send' ? ['Mail.Send'] : []),
  ].join(' ');
}

export function buildAuthUrl(
  provider: ConnectedProvider,
  client: OAuthClient,
  p: { redirectUri: string; state: string; codeChallenge: string | null; mode: ConnectMode; tenant: string },
): string {
  const q = (params: Record<string, string | null | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
    return u.toString();
  };
  switch (provider) {
    case 'gmail':
      return `https://accounts.google.com/o/oauth2/v2/auth?${q({
        client_id: client.clientId,
        redirect_uri: p.redirectUri,
        response_type: 'code',
        scope: ['openid', 'email', GMAIL_READ_SCOPE, ...(p.mode === 'send' ? [GMAIL_SEND_SCOPE] : [])].join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state: p.state,
        code_challenge: p.codeChallenge,
        code_challenge_method: p.codeChallenge ? 'S256' : null,
      })}`;
    case 'outlook':
      return `${microsoftBase(p.tenant)}/authorize?${q({
        client_id: client.clientId,
        redirect_uri: p.redirectUri,
        response_type: 'code',
        response_mode: 'query',
        scope: outlookScopes(p.mode),
        prompt: 'select_account',
        state: p.state,
        code_challenge: p.codeChallenge,
        code_challenge_method: p.codeChallenge ? 'S256' : null,
      })}`;
    case 'notion':
      return `https://api.notion.com/v1/oauth/authorize?${q({
        client_id: client.clientId,
        redirect_uri: p.redirectUri,
        response_type: 'code',
        owner: 'user',
        state: p.state,
      })}`;
    case 'jira':
      return `https://auth.atlassian.com/authorize?${q({
        audience: 'api.atlassian.com',
        client_id: client.clientId,
        scope: 'read:jira-work write:jira-work read:jira-user offline_access',
        redirect_uri: p.redirectUri,
        state: p.state,
        response_type: 'code',
        prompt: 'consent',
      })}`;
    case 'linear':
      return `https://linear.app/oauth/authorize?${q({
        client_id: client.clientId,
        redirect_uri: p.redirectUri,
        response_type: 'code',
        scope: 'read,write',
        state: p.state,
        prompt: 'consent',
      })}`;
    case 'todoist':
      return `https://todoist.com/oauth/authorize?${q({
        client_id: client.clientId,
        scope: 'data:read_write',
        state: p.state,
      })}`;
  }
}

interface RawToken {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  scope?: string;
  [k: string]: unknown;
}

function toTokenSet(raw: RawToken, previousRefresh: string | null = null): TokenSet {
  if (!raw?.access_token) throw new Error('The provider did not return an access token');
  const expires = Number(raw.expires_in);
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? previousRefresh,
    expiresAt: Number.isFinite(expires) && expires > 0 ? new Date(Date.now() + expires * 1000) : null,
    scope: typeof raw.scope === 'string' ? raw.scope : null,
    raw,
  };
}

/** Exchanges the authorization code (single use, never retried). */
export async function exchangeCode(
  provider: ConnectedProvider,
  client: OAuthClient,
  p: { code: string; redirectUri: string; verifier: string | null; tenant: string; mode: ConnectMode },
): Promise<TokenSet> {
  const base = { provider: HTTP_PROVIDER[provider], operation: 'oauth.token', method: 'POST' as const, retries: 0 };
  switch (provider) {
    case 'gmail': {
      const body = new URLSearchParams({
        code: p.code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: p.redirectUri,
        grant_type: 'authorization_code',
      });
      if (p.verifier) body.set('code_verifier', p.verifier);
      return toTokenSet(await httpJson<RawToken>({ ...base, url: 'https://oauth2.googleapis.com/token', body }));
    }
    case 'outlook': {
      const body = new URLSearchParams({
        code: p.code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: p.redirectUri,
        grant_type: 'authorization_code',
        scope: outlookScopes(p.mode),
      });
      if (p.verifier) body.set('code_verifier', p.verifier);
      return toTokenSet(await httpJson<RawToken>({ ...base, url: `${microsoftBase(p.tenant)}/token`, body }));
    }
    case 'notion':
      return toTokenSet(
        await httpJson<RawToken>({
          ...base,
          url: 'https://api.notion.com/v1/oauth/token',
          headers: { authorization: basicAuth(client.clientId, client.clientSecret) },
          body: { grant_type: 'authorization_code', code: p.code, redirect_uri: p.redirectUri },
        }),
      );
    case 'jira':
      return toTokenSet(
        await httpJson<RawToken>({
          ...base,
          url: 'https://auth.atlassian.com/oauth/token',
          body: {
            grant_type: 'authorization_code',
            client_id: client.clientId,
            client_secret: client.clientSecret,
            code: p.code,
            redirect_uri: p.redirectUri,
          },
        }),
      );
    case 'linear':
      return toTokenSet(
        await httpJson<RawToken>({
          ...base,
          url: 'https://api.linear.app/oauth/token',
          body: new URLSearchParams({
            code: p.code,
            redirect_uri: p.redirectUri,
            client_id: client.clientId,
            client_secret: client.clientSecret,
            grant_type: 'authorization_code',
          }),
        }),
      );
    case 'todoist':
      return toTokenSet(
        await httpJson<RawToken>({
          ...base,
          url: 'https://todoist.com/oauth/access_token',
          body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, code: p.code }),
        }),
      );
  }
}

/** Refreshes an access token. Atlassian rotates refresh tokens; the others may keep the old one. */
export async function refreshToken(
  provider: ConnectedProvider,
  client: OAuthClient,
  refresh: string,
  tenant: string,
  scope: string | null,
): Promise<TokenSet> {
  const base = { provider: HTTP_PROVIDER[provider], operation: 'oauth.refresh', method: 'POST' as const, retries: 2 };
  switch (provider) {
    case 'gmail':
      return toTokenSet(
        await httpJson<RawToken>({
          ...base,
          url: 'https://oauth2.googleapis.com/token',
          body: new URLSearchParams({
            client_id: client.clientId,
            client_secret: client.clientSecret,
            refresh_token: refresh,
            grant_type: 'refresh_token',
          }),
        }),
        refresh,
      );
    case 'outlook':
      return toTokenSet(
        await httpJson<RawToken>({
          ...base,
          url: `${microsoftBase(tenant)}/token`,
          body: new URLSearchParams({
            client_id: client.clientId,
            client_secret: client.clientSecret,
            refresh_token: refresh,
            grant_type: 'refresh_token',
            scope: /Mail\.Send/i.test(scope ?? '') ? outlookScopes('send') : outlookScopes('read'),
          }),
        }),
        refresh,
      );
    case 'notion':
      return toTokenSet(
        await httpJson<RawToken>({
          ...base,
          url: 'https://api.notion.com/v1/oauth/token',
          headers: { authorization: basicAuth(client.clientId, client.clientSecret) },
          body: { grant_type: 'refresh_token', refresh_token: refresh },
        }),
        refresh,
      );
    case 'jira':
      return toTokenSet(
        await httpJson<RawToken>({
          ...base,
          url: 'https://auth.atlassian.com/oauth/token',
          body: {
            grant_type: 'refresh_token',
            client_id: client.clientId,
            client_secret: client.clientSecret,
            refresh_token: refresh,
          },
        }),
        refresh,
      );
    case 'linear':
      return toTokenSet(
        await httpJson<RawToken>({
          ...base,
          url: 'https://api.linear.app/oauth/token',
          body: new URLSearchParams({
            refresh_token: refresh,
            client_id: client.clientId,
            client_secret: client.clientSecret,
            grant_type: 'refresh_token',
          }),
        }),
        refresh,
      );
    case 'todoist':
      // Todoist tokens do not expire.
      throw new Error('Todoist tokens cannot be refreshed');
  }
}

/** Who the account is (label shown in Connected apps) and provider-specific ids. */
export async function identify(provider: ConnectedProvider, tokens: TokenSet): Promise<AccountIdentity> {
  const token = tokens.accessToken;
  const http = { provider: HTTP_PROVIDER[provider], token };
  switch (provider) {
    case 'gmail': {
      const me = await httpJson<{ emailAddress?: string }>({
        ...http,
        operation: 'gmail.profile',
        url: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      });
      return {
        label: me.emailAddress ?? null,
        externalId: me.emailAddress ?? null,
        settings: { canSend: (tokens.scope ?? '').split(' ').includes(GMAIL_SEND_SCOPE) },
      };
    }
    case 'outlook': {
      const me = await httpJson<{ id?: string; mail?: string | null; userPrincipalName?: string }>({
        ...http,
        operation: 'graph.me',
        url: 'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName',
      });
      return {
        label: me.mail ?? me.userPrincipalName ?? null,
        externalId: me.id ?? null,
        settings: { canSend: /Mail\.Send/i.test(tokens.scope ?? '') },
      };
    }
    case 'notion': {
      const raw = tokens.raw as {
        workspace_id?: string;
        workspace_name?: string;
        owner?: { user?: { person?: { email?: string } } };
      };
      return {
        label: raw.workspace_name ?? raw.owner?.user?.person?.email ?? 'Notion',
        externalId: raw.workspace_id ?? null,
        settings: {},
      };
    }
    case 'jira': {
      const sites = await httpJson<{ id: string; url: string; name: string; scopes?: string[] }[]>({
        ...http,
        operation: 'jira.resources',
        url: 'https://api.atlassian.com/oauth/token/accessible-resources',
      });
      const site = sites.find((s) => (s.scopes ?? []).some((x) => x.includes('jira'))) ?? sites[0];
      if (!site) throw new Error('No Jira site is available for this account');
      let accountId: string | null = null;
      try {
        const me = await httpJson<{ accountId?: string }>({
          ...http,
          operation: 'jira.myself',
          url: `https://api.atlassian.com/ex/jira/${site.id}/rest/api/3/myself`,
        });
        accountId = me.accountId ?? null;
      } catch {
        // Optional: "assigned to me" uses currentUser() in JQL anyway.
      }
      return {
        label: site.name,
        externalId: site.id,
        settings: { cloudId: site.id, siteUrl: site.url, accountId },
      };
    }
    case 'linear': {
      const res = await httpJson<{
        data?: { viewer?: { id: string; email?: string }; organization?: { name?: string } };
      }>({
        ...http,
        operation: 'linear.viewer',
        method: 'POST',
        url: 'https://api.linear.app/graphql',
        body: { query: '{ viewer { id email } organization { name } }' },
      });
      return {
        label: res.data?.organization?.name ?? res.data?.viewer?.email ?? 'Linear',
        externalId: res.data?.viewer?.id ?? null,
        settings: { viewerId: res.data?.viewer?.id ?? null },
      };
    }
    case 'todoist': {
      const me = await httpJson<{ id?: string | number; email?: string }>({
        ...http,
        operation: 'todoist.user',
        url: 'https://api.todoist.com/api/v1/user',
      });
      return { label: me.email ?? 'Todoist', externalId: me.id != null ? String(me.id) : null, settings: {} };
    }
  }
}

/** Best-effort revocation when the user disconnects (only Google exposes a simple endpoint). */
export async function revokeToken(provider: ConnectedProvider, token: string): Promise<void> {
  if (provider !== 'gmail') return;
  await httpJson({
    provider: 'google',
    operation: 'oauth.revoke',
    method: 'POST',
    url: 'https://oauth2.googleapis.com/revoke',
    body: new URLSearchParams({ token }),
    retries: 1,
  });
}
