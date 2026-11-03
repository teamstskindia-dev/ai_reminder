import { Injectable, Logger } from '@nestjs/common';
import { calendar, calendar_v3 } from '@googleapis/calendar';
import { CodeChallengeMethod, Credentials, OAuth2Client } from 'google-auth-library';
import { AppConfig } from '../../config/app-config';
import { callExternal } from '../external/external-call';

export const GOOGLE_SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.events.readonly'];
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  locale: string | null;
}

export interface StoredGoogleTokens {
  accessToken: string | null;
  refreshToken: string | null;
  expiryDate: number | null;
}

/** True for Google's "the refresh token was revoked/expired" response (no point retrying). */
export function isInvalidGrant(err: unknown): boolean {
  const e = err as { message?: string; response?: { data?: { error?: string } } } | null;
  return e?.response?.data?.error === 'invalid_grant' || /invalid_grant/i.test(e?.message ?? '');
}

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(private readonly config: AppConfig) {}

  createClient(): OAuth2Client {
    const { clientId, clientSecret, redirectUri } = this.config.google;
    return new OAuth2Client({ clientId, clientSecret, redirectUri });
  }

  /** PKCE pair for the backend ↔ Google leg (S256). */
  async createPkcePair(): Promise<{ codeVerifier: string; codeChallenge: string }> {
    const pair = await this.createClient().generateCodeVerifierAsync();
    if (!pair.codeChallenge) throw new Error('google-auth-library did not return a code challenge');
    return { codeVerifier: pair.codeVerifier, codeChallenge: pair.codeChallenge };
  }

  buildAuthUrl(state: string, codeChallenge: string): string {
    return this.createClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });
  }

  /** Exchanges the authorization code (single use → never retried) and verifies the id_token. */
  async exchangeCode(code: string, codeVerifier: string): Promise<{ tokens: Credentials; profile: GoogleProfile }> {
    const client = this.createClient();
    const { tokens } = await callExternal(
      { provider: 'google', operation: 'oauth.token', retries: 0, timeoutMs: 15_000 },
      () => client.getToken({ code, codeVerifier }),
    );
    if (!tokens.id_token) throw new Error('Google did not return an id_token');
    const idToken = tokens.id_token;
    const ticket = await callExternal({ provider: 'google', operation: 'oauth.verifyIdToken', retries: 2 }, () =>
      client.verifyIdToken({ idToken, audience: this.config.google.clientId }),
    );
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new Error('Google id_token is missing sub/email');
    if (payload.email_verified === false) throw new Error('Google account email is not verified');
    return {
      tokens,
      profile: {
        sub: payload.sub,
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified ?? false,
        name: payload.name ?? null,
        picture: payload.picture ?? null,
        locale: (payload as { locale?: string }).locale ?? null,
      },
    };
  }

  /** Best-effort token revocation at Google (never throws). */
  async revoke(token: string | null): Promise<void> {
    if (!token) return;
    try {
      const client = this.createClient();
      await callExternal({ provider: 'google', operation: 'oauth.revoke', retries: 1, timeoutMs: 10_000 }, () =>
        client.revokeToken(token),
      );
    } catch {
      this.logger.warn({ provider: 'google', operation: 'oauth.revoke' }, 'Google token revoke failed (ignored)');
    }
  }

  /**
   * Calendar API client with stored credentials. google-auth-library refreshes the access token
   * transparently; `onTokens` receives refreshed credentials so they can be persisted (encrypted).
   */
  calendarClient(stored: StoredGoogleTokens, onTokens: (tokens: Credentials) => void): calendar_v3.Calendar {
    const client = this.createClient();
    client.setCredentials({
      access_token: stored.accessToken ?? undefined,
      refresh_token: stored.refreshToken ?? undefined,
      expiry_date: stored.expiryDate ?? undefined,
    });
    client.on('tokens', onTokens);
    return calendar({ version: 'v3', auth: client, timeout: 20_000 });
  }
}
