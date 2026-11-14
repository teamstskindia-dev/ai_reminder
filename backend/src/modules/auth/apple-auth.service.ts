import { createPublicKey, verify as verifySignature, type JsonWebKey } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { callExternal } from '../../infra/external/external-call';
import { SettingsService } from '../content/settings.service';
import { UsersRepository } from '../users/users.repository';

export const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const KEYS_TTL_MS = 60 * 60_000;
const CLOCK_SKEW_SECONDS = 60;

export interface AppleJwk extends JsonWebKey {
  kid: string;
  alg?: string;
}

export interface AppleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
}

function decodePart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
}

const truthy = (v: unknown) => v === true || v === 'true';

/**
 * Sign in with Apple (user-flow §02): the iOS app sends Apple's identity token (a JWT signed with one of
 * Apple's published keys). We verify signature, issuer, audience and expiry, then find or create the user
 * by Apple's stable `sub` (linking to an existing account only when Apple says the email is verified).
 */
@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);
  private keys: { fetchedAt: number; byKid: Map<string, AppleJwk> } | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly settings: SettingsService,
    private readonly users: UsersRepository,
  ) {}

  /** Apple's current signing keys (overridable in tests). */
  protected async fetchKeys(): Promise<AppleJwk[]> {
    const res = await callExternal(
      { provider: 'apple', operation: 'auth/keys', retries: 1, timeoutMs: 10_000 },
      (signal) => fetch(APPLE_KEYS_URL, { signal }),
    );
    if (!res.ok) throw new Error(`Apple keys request failed (${res.status})`);
    const body = (await res.json()) as { keys?: AppleJwk[] };
    return body.keys ?? [];
  }

  private async keyFor(kid: string): Promise<AppleJwk | undefined> {
    const fresh = this.keys && Date.now() - this.keys.fetchedAt < KEYS_TTL_MS;
    if (!fresh || !this.keys?.byKid.has(kid)) {
      try {
        const list = await this.fetchKeys();
        this.keys = { fetchedAt: Date.now(), byKid: new Map(list.map((k) => [k.kid, k])) };
      } catch (err) {
        this.logger.warn(`Could not load Apple signing keys: ${(err as Error).message}`);
        throw AppException.upstream('apple', err, 'Apple sign-in is unavailable right now. Please try again.');
      }
    }
    return this.keys?.byKid.get(kid);
  }

  /** Verifies an Apple identity token and returns who it belongs to. */
  async verifyIdentityToken(token: string): Promise<AppleIdentity> {
    const invalid = () => AppException.unauthorized('Apple sign-in failed. Please try again.');
    const parts = token.split('.');
    if (parts.length !== 3) throw invalid();
    let header: { kid?: string; alg?: string };
    let payload: Record<string, unknown>;
    try {
      header = decodePart(parts[0]);
      payload = decodePart(parts[1]);
    } catch {
      throw invalid();
    }
    if (header.alg !== 'RS256' || !header.kid) throw invalid();

    const jwk = await this.keyFor(header.kid);
    if (!jwk) throw invalid();
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    const ok = verifySignature(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      publicKey,
      Buffer.from(parts[2], 'base64url'),
    );
    if (!ok) throw invalid();

    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.iss !== APPLE_ISSUER) throw invalid();
    if (!audiences.some((a) => typeof a === 'string' && this.config.apple.clientIds.includes(a))) throw invalid();
    if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < now) {
      throw AppException.unauthorized('Apple sign-in expired. Please try again.');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) throw invalid();

    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
      emailVerified: truthy(payload.email_verified),
    };
  }

  /** Finds or creates the user for a verified Apple identity. */
  async signIn(
    identityToken: string,
    fullName: { givenName?: string; familyName?: string },
  ): Promise<{ userId: string; isNewUser: boolean }> {
    const identity = await this.verifyIdentityToken(identityToken);
    const now = new Date();
    const name =
      [fullName.givenName, fullName.familyName]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join(' ') || null;

    const existing =
      (await this.users.findByAppleSub(identity.sub)) ??
      (identity.email && identity.emailVerified ? await this.users.findByEmail(identity.email) : null);
    if (existing) {
      if (existing.status === 'suspended') throw AppException.forbidden('Your account is suspended');
      await this.users.update(existing.id, {
        appleSub: existing.appleSub ?? identity.sub,
        name: existing.name ?? name,
        lastLoginAt: now,
      });
      return { userId: existing.id, isNewUser: false };
    }

    const features = await this.settings.get('features');
    if (!features.signupsEnabled) throw AppException.forbidden('New sign-ups are paused right now.');
    if (!identity.email) {
      // Apple shares the email only on the first authorisation; without it we cannot create an account.
      throw AppException.badRequest(
        'Apple did not share an email. In Settings → Apple ID → Sign-In & Security → Sign in with Apple, remove this app and try again.',
      );
    }
    const [bot, notifications, planId] = await Promise.all([
      this.settings.get('bot'),
      this.settings.get('notifications'),
      this.users.defaultPlanId(),
    ]);
    const user = await this.users.createWithSettings(
      { email: identity.email, name, appleSub: identity.sub, planId, lastLoginAt: now },
      { autoJoin: bot.autoJoinDefault, meetingReminderMinutes: notifications.defaultMeetingReminderMinutes },
    );
    return { userId: user.id, isNewUser: true };
  }
}
