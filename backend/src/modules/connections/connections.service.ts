import { createHash } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { AppException, causeChain } from '../../common/errors/app.exception';
import { securityLog } from '../../common/logging/security-log';
import type { ConnectedProvider, Integration, IntegrationSettings, ToolProvider } from '../../common/types/api.types';
import { decryptString, encryptString, randomToken } from '../../common/utils/crypto.util';
import { hasGmailScope } from '../../infra/google/google-oauth.service';
import type { ConnectedAccountRow, GoogleAccountRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { upsertJob } from '../../infra/queue/job-utils';
import { EmailSyncJob, JOB, JobId, QUEUE } from '../../infra/queue/queue.constants';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';
import { withQuery } from '../auth/with-query';
import { isAllowedRedirect } from '../auth/redirect-allowlist';
import { NotificationProducer } from '../notifications/notification-producer.service';
import { toIntegration } from '../users/users.mapper';
import { GoogleAccountsRepository } from '../users/users.repository';
import {
  buildAuthUrl,
  CONNECTED_PROVIDERS,
  type ConnectMode,
  exchangeCode,
  GMAIL_SEND_SCOPE,
  identify,
  isConnectedProvider,
  isEmailProvider,
  type OAuthClient,
  PROVIDER_NAME,
  refreshToken,
  supportsPkce,
} from './oauth-providers';
import { ProviderHttpError } from './provider-http';

const STATE_TTL_SECONDS = 600;
/** Refresh access tokens this long before they expire. */
const REFRESH_SKEW_MS = 2 * 60_000;

interface ConnectState {
  userId: string;
  provider: ConnectedProvider;
  redirect: string;
  verifier: string | null;
  mode: ConnectMode;
}

/** The connected app needs the user to sign in again (access expired or was revoked). */
export class ReconnectRequiredError extends AppException {
  constructor(readonly provider: ConnectedProvider) {
    super('CONFLICT', `Reconnect ${PROVIDER_NAME[provider]} in Connected apps to continue.`);
  }
}

export function accountSettings(row: Pick<ConnectedAccountRow, 'settings'> | null): Record<string, unknown> {
  const s = row?.settings;
  return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
}

function toSettings(provider: ConnectedProvider, row: ConnectedAccountRow): IntegrationSettings {
  const s = accountSettings(row);
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    canSend: isEmailProvider(provider) ? s.canSend === true : null,
    targetId: str(s.targetId),
    targetName: str(s.targetName),
    autoSend: s.autoSend === true,
  };
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * Connected apps (user-flow §07 email, §08 tools): OAuth connect from the phone, encrypted tokens at rest,
 * transparent refresh, and a "reconnect" state (plus one notification) when access expires or is revoked.
 */
@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly googleAccounts: GoogleAccountsRepository,
    private readonly notifications: NotificationProducer,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(QUEUE.INTEGRATIONS) private readonly queue: Queue,
  ) {}

  client(provider: ConnectedProvider): OAuthClient | null {
    return this.config.integrations[provider];
  }

  available(provider: ConnectedProvider): boolean {
    return this.client(provider) !== null;
  }

  // ---------------------------------------------------------------- listing

  async list(userId: string): Promise<Integration[]> {
    const [google, accounts] = await Promise.all([
      this.googleAccounts.find(userId),
      this.prisma.connectedAccount.findMany({ where: { userId } }),
    ]);
    return [
      this.calendarIntegration(google),
      ...CONNECTED_PROVIDERS.map((p) => this.toIntegration(p, accounts.find((a) => a.provider === p) ?? null)),
    ];
  }

  private calendarIntegration(google: GoogleAccountRow | null): Integration {
    return toIntegration(google);
  }

  toIntegration(provider: ConnectedProvider, row: ConnectedAccountRow | null): Integration {
    return {
      provider,
      kind: isEmailProvider(provider) ? 'email' : 'tasks',
      available: this.available(provider),
      connected: row?.status === 'connected',
      status: !row ? 'not_connected' : row.status === 'connected' ? 'connected' : 'needs_reconnect',
      accountEmail: row?.accountLabel ?? null,
      lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
      syncError: row?.status === 'needs_reconnect' ? (row.lastError ?? 'Access expired. Reconnect to continue.') : null,
      settings: row ? toSettings(provider, row) : null,
    };
  }

  findAccount(userId: string, provider: ConnectedProvider): Promise<ConnectedAccountRow | null> {
    return this.prisma.connectedAccount.findUnique({ where: { userId_provider: { userId, provider } } });
  }

  async requireAccount(userId: string, provider: ConnectedProvider): Promise<ConnectedAccountRow> {
    const row = await this.findAccount(userId, provider);
    if (!row) throw AppException.conflict(`${PROVIDER_NAME[provider]} is not connected. Connect it in Connected apps.`);
    if (row.status !== 'connected') throw new ReconnectRequiredError(provider);
    return row;
  }

  /** The user's connected email account (Gmail first), if any. */
  async emailAccount(userId: string): Promise<ConnectedAccountRow | null> {
    const rows = await this.prisma.connectedAccount.findMany({
      where: { userId, kind: 'email' },
      orderBy: { createdAt: 'asc' },
    });
    return rows.find((r) => r.status === 'connected') ?? rows[0] ?? null;
  }

  /** Connected task tools, oldest first (the first one is the default when the user names none). */
  toolAccounts(userId: string): Promise<ConnectedAccountRow[]> {
    return this.prisma.connectedAccount.findMany({
      where: { userId, kind: 'tasks', status: 'connected' },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ---------------------------------------------------------------- connect

  async connectUrl(
    userId: string,
    provider: string,
    redirectUri: string,
    mode: ConnectMode = 'send',
  ): Promise<{ url: string }> {
    if (!isConnectedProvider(provider)) throw AppException.notFound('Integration');
    const client = this.client(provider);
    if (!client) throw AppException.conflict(`${PROVIDER_NAME[provider]} isn't available yet.`);
    if (!this.allowedRedirect(redirectUri)) {
      securityLog('oauth_redirect_rejected', { redirectUriLength: redirectUri.length });
      throw AppException.badRequest('redirectUri is not allowed');
    }
    const nonce = randomToken(24);
    const pkce = supportsPkce(provider) ? pkcePair() : null;
    const state: ConnectState = { userId, provider, redirect: redirectUri, verifier: pkce?.verifier ?? null, mode };
    await this.redis.set(RedisKeys.connectState(nonce), JSON.stringify(state), 'EX', STATE_TTL_SECONDS);
    return {
      url: buildAuthUrl(provider, client, {
        redirectUri: this.config.integrations.redirectUri,
        state: nonce,
        codeChallenge: pkce?.challenge ?? null,
        mode,
        tenant: this.config.integrations.microsoftTenant,
      }),
    };
  }

  private allowedRedirect(uri: string): boolean {
    if (isAllowedRedirect(uri, this.config.google.mobileRedirectAllowlist)) return true;
    const web = this.config.urls.web;
    return uri === web || uri.startsWith(`${web}/`);
  }

  /** Provider → API callback. Always returns where to redirect the browser (the app or the website). */
  async handleCallback(query: Record<string, string | undefined>): Promise<string> {
    const fallback = `${this.config.urls.web}/settings`;
    const raw = query.state ? await this.redis.getdel(RedisKeys.connectState(query.state.slice(0, 200))) : null;
    if (!raw) {
      securityLog('oauth_state_invalid');
      return withQuery(fallback, { error: 'connect_failed' });
    }
    let state: ConnectState;
    try {
      state = JSON.parse(raw) as ConnectState;
    } catch {
      return withQuery(fallback, { error: 'connect_failed' });
    }
    const target = state.redirect;
    const provider = state.provider;
    if (query.error) {
      return withQuery(target, {
        provider,
        error: query.error === 'access_denied' ? 'access_denied' : 'connect_failed',
      });
    }
    const client = this.client(provider);
    if (!query.code || !client) return withQuery(target, { provider, error: 'connect_failed' });
    try {
      const tokens = await exchangeCode(provider, client, {
        code: query.code,
        redirectUri: this.config.integrations.redirectUri,
        verifier: state.verifier,
        tenant: this.config.integrations.microsoftTenant,
        mode: state.mode,
      });
      const who = await identify(provider, tokens);
      const key = this.config.encryptionKey;
      const existing = await this.findAccount(state.userId, provider);
      const sameAccount = !existing || !who.externalId || existing.externalAccountId === who.externalId;
      // Keep the user's defaults (project, auto-send) when they reconnect the same account.
      const settings = { ...(sameAccount ? accountSettings(existing) : {}), ...who.settings };
      const data = {
        kind: isEmailProvider(provider) ? 'email' : 'tasks',
        accountLabel: who.label?.slice(0, 200) ?? null,
        externalAccountId: who.externalId,
        accessTokenEnc: encryptString(tokens.accessToken, key),
        refreshTokenEnc: tokens.refreshToken ? encryptString(tokens.refreshToken, key) : null,
        tokenExpiresAt: tokens.expiresAt,
        scope: tokens.scope,
        status: 'connected',
        lastError: null,
        settings: settings as Prisma.InputJsonValue,
        ...(sameAccount ? {} : { syncCursor: null, lastSyncedAt: null }),
      };
      const row = await this.prisma.connectedAccount.upsert({
        where: { userId_provider: { userId: state.userId, provider } },
        create: { userId: state.userId, provider, ...data },
        update: data,
      });
      if (!sameAccount) await this.prisma.emailMessage.deleteMany({ where: { accountId: row.id } });
      if (isEmailProvider(provider)) await this.enqueueEmailSync(row.id);
      this.logger.log({ userId: state.userId, provider }, 'app connected');
      return withQuery(target, { provider, status: 'connected' });
    } catch (err) {
      this.logger.warn({ provider, causes: causeChain(err) }, 'connecting an app failed');
      return withQuery(target, { provider, error: 'connect_failed' });
    }
  }

  async enqueueEmailSync(accountId: string): Promise<void> {
    await upsertJob<EmailSyncJob>(
      this.queue,
      JOB.EMAIL_SYNC,
      { accountId },
      { jobId: JobId.emailSync(accountId) },
      'keep',
    ).catch((err: Error) => this.logger.warn(`Could not enqueue email sync: ${err.message}`));
  }

  async disconnect(userId: string, provider: string): Promise<void> {
    if (!isConnectedProvider(provider)) throw AppException.notFound('Integration');
    const row = await this.findAccount(userId, provider);
    if (!row) return;
    // Tokens are dropped, not revoked at the provider: Gmail shares the Google sign-in grant, and revoking it
    // would also cut Calendar and sign-in. Emails go with the account; tasks already in a tool stay as to-dos.
    await this.prisma.connectedAccount.delete({ where: { id: row.id } });
  }

  /**
   * Gmail asked on the Google sign-in (user-flow §07): when the user granted it there, Gmail is connected with
   * the same tokens, so a new user does not connect it again. An existing connection is never replaced; one
   * that lost access is refreshed only when it is the same mailbox.
   */
  async linkGmailFromSignIn(
    userId: string,
    p: {
      email: string;
      accessToken: string | null;
      refreshToken: string | null;
      expiresAt: Date | null;
      scope: string;
    },
  ): Promise<void> {
    if (!this.available('gmail') || !hasGmailScope(p.scope) || !p.accessToken || !p.refreshToken) return;
    const email = p.email.toLowerCase();
    const existing = await this.findAccount(userId, 'gmail');
    if (existing && (existing.status === 'connected' || existing.externalAccountId?.toLowerCase() !== email)) return;
    const key = this.config.encryptionKey;
    const data = {
      kind: 'email',
      accountLabel: email.slice(0, 200),
      externalAccountId: email,
      accessTokenEnc: encryptString(p.accessToken, key),
      refreshTokenEnc: encryptString(p.refreshToken, key),
      tokenExpiresAt: p.expiresAt,
      scope: p.scope,
      status: 'connected',
      lastError: null,
      settings: {
        ...accountSettings(existing),
        canSend: p.scope.split(' ').includes(GMAIL_SEND_SCOPE),
      } as Prisma.InputJsonValue,
    };
    const row = await this.prisma.connectedAccount.upsert({
      where: { userId_provider: { userId, provider: 'gmail' } },
      create: { userId, provider: 'gmail', ...data },
      update: data,
    });
    await this.enqueueEmailSync(row.id);
    this.logger.log({ userId, provider: 'gmail' }, 'Gmail connected from Google sign-in');
  }

  async updateSettings(
    userId: string,
    provider: string,
    patch: { targetId?: string | null; targetName?: string | null; autoSend?: boolean },
  ): Promise<Integration> {
    if (!isConnectedProvider(provider)) throw AppException.notFound('Integration');
    const row = await this.findAccount(userId, provider);
    if (!row) throw AppException.conflict(`${PROVIDER_NAME[provider]} is not connected.`);
    const next = { ...accountSettings(row) };
    if (patch.targetId !== undefined) next.targetId = patch.targetId;
    if (patch.targetName !== undefined) next.targetName = patch.targetName;
    if (patch.autoSend !== undefined) next.autoSend = patch.autoSend;
    const updated = await this.prisma.connectedAccount.update({
      where: { id: row.id },
      data: { settings: next as Prisma.InputJsonValue },
    });
    return this.toIntegration(provider, updated);
  }

  async saveSettings(row: ConnectedAccountRow, patch: Record<string, unknown>): Promise<ConnectedAccountRow> {
    return this.prisma.connectedAccount.update({
      where: { id: row.id },
      data: { settings: { ...accountSettings(row), ...patch } as Prisma.InputJsonValue },
    });
  }

  // ---------------------------------------------------------------- tokens

  /** A valid access token, refreshed when it is about to expire. */
  async accessToken(row: ConnectedAccountRow, force = false): Promise<string> {
    const provider = row.provider as ConnectedProvider;
    if (row.status !== 'connected') throw new ReconnectRequiredError(provider);
    const key = this.config.encryptionKey;
    if (!row.accessTokenEnc) throw await this.needsReconnect(row, 'Access was removed. Reconnect to continue.');
    const expiring = row.tokenExpiresAt && row.tokenExpiresAt.getTime() - Date.now() < REFRESH_SKEW_MS;
    if (!force && !expiring) return decryptString(row.accessTokenEnc, key);
    const client = this.client(provider);
    if (!row.refreshTokenEnc || !client) {
      if (!force && row.tokenExpiresAt === null) return decryptString(row.accessTokenEnc, key);
      throw await this.needsReconnect(row, 'Access expired. Reconnect to continue.');
    }
    try {
      const fresh = await refreshToken(
        provider,
        client,
        decryptString(row.refreshTokenEnc, key),
        this.config.integrations.microsoftTenant,
        row.scope,
      );
      await this.prisma.connectedAccount.update({
        where: { id: row.id },
        data: {
          accessTokenEnc: encryptString(fresh.accessToken, key),
          ...(fresh.refreshToken ? { refreshTokenEnc: encryptString(fresh.refreshToken, key) } : {}),
          tokenExpiresAt: fresh.expiresAt,
          ...(fresh.scope ? { scope: fresh.scope } : {}),
        },
      });
      return fresh.accessToken;
    } catch (err) {
      if (err instanceof ProviderHttpError && (err.isAuth || err.status === 400)) {
        throw await this.needsReconnect(row, 'Access expired or was revoked. Reconnect to continue.');
      }
      throw err;
    }
  }

  /**
   * Runs a provider call with a valid token. A 401 gets one forced refresh; if it still fails the account is
   * marked "needs reconnect" (with one notification) and ReconnectRequiredError is thrown.
   */
  async withToken<T>(row: ConnectedAccountRow, fn: (token: string) => Promise<T>): Promise<T> {
    const token = await this.accessToken(row);
    try {
      return await fn(token);
    } catch (err) {
      if (!(err instanceof ProviderHttpError) || err.status !== 401) throw err;
      const fresh = await this.accessToken(row, true);
      try {
        return await fn(fresh);
      } catch (again) {
        if (again instanceof ProviderHttpError && again.status === 401) {
          throw await this.needsReconnect(row, 'Access expired or was revoked. Reconnect to continue.');
        }
        throw again;
      }
    }
  }

  /** Marks the account "needs reconnect" and tells the user once a day (push + in-app). */
  async needsReconnect(row: ConnectedAccountRow, reason: string): Promise<ReconnectRequiredError> {
    const provider = row.provider as ConnectedProvider;
    await this.prisma.connectedAccount.update({
      where: { id: row.id },
      data: { status: 'needs_reconnect', lastError: reason.slice(0, 300) },
    });
    securityLog('connected_app_access_lost', { userId: row.userId, provider });
    const day = new Date().toISOString().slice(0, 10);
    const first = await this.redis.set(RedisKeys.reconnectNotice(row.id, day), '1', 'EX', 2 * 86_400, 'NX');
    if (first === 'OK') {
      const name = PROVIDER_NAME[provider];
      await this.notifications.notify({
        userId: row.userId,
        type: 'reconnect_needed',
        templateKey: 'reconnect_needed',
        vars: {
          title: `Reconnect ${name}`,
          body:
            row.kind === 'email'
              ? `I can't read your ${name} right now. Reconnect it so I keep watching for important emails.`
              : `I can't reach ${name} right now. New tasks stay in the app until you reconnect it.`,
        },
        data: { url: '/connected-apps', provider },
      });
    }
    return new ReconnectRequiredError(provider);
  }

  /** Tools only: the provider ids of connected task tools. */
  async connectedTools(userId: string): Promise<ToolProvider[]> {
    return (await this.toolAccounts(userId)).map((a) => a.provider as ToolProvider);
  }
}
