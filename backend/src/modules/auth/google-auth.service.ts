import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Credentials } from 'google-auth-library';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import type { ClientContext } from '../../common/http/request.types';
import { AppException, causeChain } from '../../common/errors/app.exception';
import { securityLog } from '../../common/logging/security-log';
import { encryptString, randomToken } from '../../common/utils/crypto.util';
import { CALENDAR_SCOPE, GoogleOAuthService, GoogleProfile } from '../../infra/google/google-oauth.service';
import { QUEUE } from '../../infra/queue/queue.constants';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';
import type { UserRow } from '../../infra/prisma/models';
import { enqueueUserSync } from '../calendar/sync-producer';
import { SettingsService } from '../content/settings.service';
import { GoogleAccountsRepository, UsersRepository } from '../users/users.repository';
import { CODE_CHALLENGE_RE, verifyPkce } from './pkce';
import { isAllowedRedirect } from './redirect-allowlist';
import { TokenService } from './token.service';

export type SignInErrorCode = 'access_denied' | 'account_suspended' | 'signups_disabled' | 'oauth_failed';

class SignInError extends Error {
  constructor(readonly code: SignInErrorCode) {
    super(code);
  }
}

export interface OneTimeCodePayload {
  userId: string;
  isNewUser: boolean;
  platform: 'web' | 'mobile';
  /** Mobile PKCE challenge carried from /auth/google (null for web). */
  codeChallenge: string | null;
}

const GOOGLE_PKCE_TTL_SECONDS = 600;
const OTC_TTL_SECONDS = 60;

/**
 * Google OAuth flow (HLD §5.1) with two PKCE legs:
 *  - app ↔ API (mobile): the app's S256 challenge travels in the signed state, is stored with the
 *    one-time code and verified at /auth/exchange;
 *  - API ↔ Google: a server-generated verifier kept in Redis (keyed by a nonce in the state).
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly tokens: TokenService,
    private readonly google: GoogleOAuthService,
    private readonly users: UsersRepository,
    private readonly googleAccounts: GoogleAccountsRepository,
    private readonly settings: SettingsService,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(QUEUE.CALENDAR_SYNC) private readonly syncQueue: Queue,
  ) {}

  async consentUrl(platform: 'web' | 'mobile', redirectUri?: string, codeChallenge?: string): Promise<string> {
    let target: string | null = null;
    let challenge: string | null = null;
    if (platform === 'mobile') {
      if (!redirectUri || !isAllowedRedirect(redirectUri, this.config.google.mobileRedirectAllowlist)) {
        securityLog('oauth_redirect_rejected', { redirectUriLength: redirectUri?.length ?? 0 });
        throw AppException.badRequest('redirectUri is missing or not in the mobile redirect allowlist');
      }
      if (!codeChallenge || !CODE_CHALLENGE_RE.test(codeChallenge)) {
        throw AppException.badRequest('codeChallenge (PKCE S256, base64url, 43-128 chars) is required for mobile');
      }
      target = redirectUri;
      challenge = codeChallenge;
    }
    const pkce = await this.google.createPkcePair();
    const nonce = randomToken(16);
    await this.redis.set(RedisKeys.googlePkce(nonce), pkce.codeVerifier, 'EX', GOOGLE_PKCE_TTL_SECONDS);
    const state = await this.tokens.signState({ p: platform, r: target, cc: challenge, n: nonce });
    return this.google.buildAuthUrl(state, pkce.codeChallenge);
  }

  /** Returns the URL to redirect the browser to (never throws). */
  async handleCallback(query: Record<string, string | undefined>): Promise<string> {
    let target = `${this.config.urls.web}/auth/callback`;
    try {
      if (!query.state) throw new SignInError('oauth_failed');
      const state = await this.tokens.verifyState(query.state).catch(() => {
        securityLog('oauth_state_invalid');
        throw new SignInError('oauth_failed');
      });
      if (state.p === 'mobile') {
        if (!state.r || !isAllowedRedirect(state.r, this.config.google.mobileRedirectAllowlist)) {
          throw new SignInError('oauth_failed');
        }
        target = state.r;
      }
      const googleVerifier = await this.redis.getdel(RedisKeys.googlePkce(state.n));
      if (query.error) throw new SignInError(query.error === 'access_denied' ? 'access_denied' : 'oauth_failed');
      if (!query.code || !googleVerifier) throw new SignInError('oauth_failed');

      const { tokens, profile } = await this.google.exchangeCode(query.code, googleVerifier).catch((err: unknown) => {
        this.logger.warn({ causes: causeChain(err) }, 'Google code exchange failed');
        throw new SignInError('oauth_failed');
      });
      const { user, isNewUser } = await this.upsertUser(profile, tokens);

      const code = randomToken(24);
      const payload: OneTimeCodePayload = { userId: user.id, isNewUser, platform: state.p, codeChallenge: state.cc };
      await this.redis.set(RedisKeys.otc(code), JSON.stringify(payload), 'EX', OTC_TTL_SECONDS);
      return withQuery(target, { code });
    } catch (err) {
      const code: SignInErrorCode = err instanceof SignInError ? err.code : 'oauth_failed';
      if (!(err instanceof SignInError)) {
        this.logger.error(
          { err: err instanceof Error ? err : undefined, causes: causeChain(err) },
          'OAuth callback failed',
        );
      }
      return withQuery(target, { error: code });
    }
  }

  /**
   * Consumes a one-time code (GETDEL, single use) and enforces mobile PKCE. A failed PKCE check still
   * consumes the code and is logged as a security event.
   */
  async consumeCode(code: string, codeVerifier: string | undefined, ctx: ClientContext): Promise<OneTimeCodePayload> {
    const raw = await this.redis.getdel(RedisKeys.otc(code));
    if (!raw) throw AppException.unauthorized('Invalid or expired sign-in code');
    let payload: OneTimeCodePayload;
    try {
      payload = JSON.parse(raw) as OneTimeCodePayload;
    } catch (err) {
      throw AppException.internal(undefined, err);
    }
    if (payload.platform === 'mobile' || payload.codeChallenge) {
      if (!payload.codeChallenge || !verifyPkce(codeVerifier, payload.codeChallenge)) {
        securityLog('pkce_verification_failed', { userId: payload.userId, ip: ctx.ip, userAgent: ctx.userAgent });
        throw AppException.badRequest('PKCE verification failed');
      }
    }
    return payload;
  }

  private async upsertUser(
    profile: GoogleProfile,
    tokens: Credentials,
  ): Promise<{ user: UserRow; isNewUser: boolean }> {
    const now = new Date();
    let user = (await this.users.findByGoogleSub(profile.sub)) ?? (await this.users.findByEmail(profile.email));
    let isNewUser = false;

    if (!user) {
      const features = await this.settings.get('features');
      if (!features.signupsEnabled) throw new SignInError('signups_disabled');
      const [bot, notifications, planId] = await Promise.all([
        this.settings.get('bot'),
        this.settings.get('notifications'),
        this.users.defaultPlanId(),
      ]);
      user = await this.users.createWithSettings(
        {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.picture,
          googleSub: profile.sub,
          locale: profile.locale?.slice(0, 20) ?? 'en',
          planId,
          lastLoginAt: now,
        },
        { autoJoin: bot.autoJoinDefault, meetingReminderMinutes: notifications.defaultMeetingReminderMinutes },
      );
      isNewUser = true;
    } else {
      if (user.status === 'suspended') throw new SignInError('account_suspended');
      user = await this.users.update(user.id, {
        googleSub: user.googleSub ?? profile.sub,
        name: user.name ?? profile.name,
        avatarUrl: profile.picture ?? user.avatarUrl,
        lastLoginAt: now,
      });
    }

    const key = this.config.encryptionKey;
    const scope = tokens.scope ?? '';
    const calendarConnected = scope.split(' ').includes(CALENDAR_SCOPE);
    const existing = await this.googleAccounts.find(user.id);
    const fields = {
      googleEmail: profile.email,
      scope,
      accessTokenEnc: tokens.access_token ? encryptString(tokens.access_token, key) : null,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      calendarConnected,
      syncError: null,
      ...(tokens.refresh_token ? { refreshTokenEnc: encryptString(tokens.refresh_token, key) } : {}),
      ...(existing && existing.googleEmail.toLowerCase() !== profile.email.toLowerCase()
        ? { calendarSyncToken: null }
        : {}),
    };
    await this.googleAccounts.upsert(user.id, fields, fields);

    if (calendarConnected && (tokens.refresh_token || existing?.refreshTokenEnc)) {
      await enqueueUserSync(this.syncQueue, user.id, 'login').catch((err: Error) =>
        this.logger.warn(`Could not enqueue initial sync: ${err.message}`),
      );
    }
    return { user, isNewUser };
  }
}

export function withQuery(target: string, params: Record<string, string>): string {
  try {
    const url = new URL(target);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
  } catch {
    const qs = new URLSearchParams(params).toString();
    return `${target}${target.includes('?') ? '&' : '?'}${qs}`;
  }
}
