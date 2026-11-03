import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import type { AdminRole } from '../../common/types/api.types';

const ISSUER = 'remi-api';
export const USER_AUDIENCE = 'remi-user';
export const ADMIN_AUDIENCE = 'remi-admin';

export interface UserTokenPayload {
  sub: string;
  typ: 'user';
}

export interface AdminTokenPayload {
  sub: string;
  typ: 'admin';
  role: AdminRole;
}

export interface OAuthStatePayload {
  /** platform */
  p: 'web' | 'mobile';
  /** validated mobile redirect URI */
  r: string | null;
  /** mobile PKCE code challenge (S256) */
  cc: string | null;
  /** nonce keying the server-held Google PKCE verifier */
  n: string;
}

/** Issues/verifies short-lived JWTs with separate secrets + audiences for users and admins. */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  get accessTtlSeconds(): number {
    return this.config.jwt.accessTtlSeconds;
  }

  signUser(userId: string): Promise<string> {
    return this.jwt.signAsync({ typ: 'user' } satisfies Omit<UserTokenPayload, 'sub'>, {
      secret: this.config.jwt.userSecret,
      audience: USER_AUDIENCE,
      issuer: ISSUER,
      subject: userId,
      expiresIn: this.accessTtlSeconds,
      algorithm: 'HS256',
    });
  }

  signAdmin(adminId: string, role: AdminRole): Promise<string> {
    return this.jwt.signAsync({ typ: 'admin', role } satisfies Omit<AdminTokenPayload, 'sub'>, {
      secret: this.config.jwt.adminSecret,
      audience: ADMIN_AUDIENCE,
      issuer: ISSUER,
      subject: adminId,
      expiresIn: this.accessTtlSeconds,
      algorithm: 'HS256',
    });
  }

  async verifyUser(token: string): Promise<UserTokenPayload> {
    const payload = await this.verify<UserTokenPayload>(token, this.config.jwt.userSecret, USER_AUDIENCE);
    if (payload.typ !== 'user' || !payload.sub) throw AppException.unauthorized('Invalid access token');
    return payload;
  }

  async verifyAdmin(token: string): Promise<AdminTokenPayload> {
    const payload = await this.verify<AdminTokenPayload>(token, this.config.jwt.adminSecret, ADMIN_AUDIENCE);
    if (payload.typ !== 'admin' || !payload.sub) throw AppException.unauthorized('Invalid access token');
    return payload;
  }

  /** Signed OAuth `state` (10 minutes) carrying the platform and the validated redirect URI. */
  signState(payload: OAuthStatePayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.jwt.stateSecret,
      audience: 'remi-oauth-state',
      issuer: ISSUER,
      expiresIn: 600,
      algorithm: 'HS256',
    });
  }

  async verifyState(state: string): Promise<OAuthStatePayload> {
    const payload = await this.verify<OAuthStatePayload>(state, this.config.jwt.stateSecret, 'remi-oauth-state');
    if ((payload.p !== 'web' && payload.p !== 'mobile') || typeof payload.n !== 'string') {
      throw AppException.unauthorized('Invalid OAuth state');
    }
    return payload;
  }

  private async verify<T extends object>(token: string, secret: string, audience: string): Promise<T> {
    try {
      return await this.jwt.verifyAsync<T>(token, { secret, audience, issuer: ISSUER, algorithms: ['HS256'] });
    } catch (err) {
      if ((err as Error).name === 'TokenExpiredError') throw AppException.tokenExpired();
      throw AppException.unauthorized('Invalid access token');
    }
  }
}
