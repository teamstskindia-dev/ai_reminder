import { randomUUID } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception';
import { securityLog } from '../../common/logging/security-log';
import type { ClientContext } from '../../common/http/request.types';
import { randomToken, sha256 } from '../../common/utils/crypto.util';
import type { AuthSessionRow } from '../../infra/prisma/models';

export type SubjectType = 'user' | 'admin';

export interface NewSession {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  familyId: string;
  tokenHash: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: Date;
}

/** Persistence port for refresh sessions (Prisma implementation + in-memory fake in tests). */
export interface AuthSessionsStore {
  insert(session: NewSession): Promise<AuthSessionRow>;
  findByHash(tokenHash: string): Promise<AuthSessionRow | null>;
  /**
   * Atomically (one transaction) inserts the replacement session and marks `currentId` as rotated,
   * only if `currentId` is still active. Returns null (and inserts nothing) when it was already revoked.
   */
  rotate(currentId: string, next: NewSession, at: Date): Promise<AuthSessionRow | null>;
  revoke(id: string, at: Date): Promise<void>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  revokeAllForSubject(subjectType: SubjectType, subjectId: string, at: Date): Promise<void>;
}

export interface IssuedRefreshToken {
  token: string;
  session: AuthSessionRow;
}

/**
 * Opaque refresh tokens: 256-bit random, stored as sha256, rotated on every use.
 * Presenting an already-rotated or revoked token revokes the whole family (theft detection).
 */
export class RefreshSessionService {
  constructor(
    private readonly store: AuthSessionsStore,
    private readonly ttlDays: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private build(
    subjectType: SubjectType,
    subjectId: string,
    ctx: ClientContext,
    familyId: string,
  ): { token: string; session: NewSession } {
    const token = randomToken(32);
    return {
      token,
      session: {
        id: randomUUID(),
        subjectType,
        subjectId,
        familyId,
        tokenHash: sha256(token),
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        expiresAt: new Date(this.now().getTime() + this.ttlDays * 86_400_000),
      },
    };
  }

  async issue(
    subjectType: SubjectType,
    subjectId: string,
    ctx: ClientContext,
    familyId: string = randomUUID(),
  ): Promise<IssuedRefreshToken> {
    const { token, session } = this.build(subjectType, subjectId, ctx, familyId);
    return { token, session: await this.store.insert(session) };
  }

  async rotate(
    token: string,
    subjectType: SubjectType,
    ctx: ClientContext,
  ): Promise<IssuedRefreshToken & { subjectId: string }> {
    if (!token) throw AppException.unauthorized('Refresh token missing');
    const now = this.now();
    const current = await this.store.findByHash(sha256(token));
    if (!current || current.subjectType !== subjectType) {
      throw AppException.unauthorized('Invalid refresh token');
    }
    if (current.revokedAt || current.replacedBy) {
      await this.store.revokeFamily(current.familyId, now);
      // A revoked-by-logout token is not theft; only a rotated (replaced) token is.
      if (current.replacedBy) {
        securityLog('refresh_token_reuse', {
          subjectType,
          subjectId: current.subjectId,
          familyId: current.familyId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
      }
      throw AppException.unauthorized('Refresh token reuse detected; please sign in again');
    }
    if (current.expiresAt.getTime() <= now.getTime()) {
      await this.store.revoke(current.id, now);
      throw AppException.unauthorized('Refresh token expired');
    }
    const next = this.build(subjectType, current.subjectId, ctx, current.familyId);
    const session = await this.store.rotate(current.id, next.session, now);
    if (!session) {
      // Lost a race with another request presenting the same token: treat as reuse.
      await this.store.revokeFamily(current.familyId, now);
      securityLog('refresh_token_reuse', {
        subjectType,
        subjectId: current.subjectId,
        familyId: current.familyId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        concurrent: true,
      });
      throw AppException.unauthorized('Refresh token reuse detected; please sign in again');
    }
    return { token: next.token, session, subjectId: current.subjectId };
  }

  /** Revokes the session family of a token (logout). Unknown tokens are ignored. */
  async revoke(token: string | undefined, subjectType: SubjectType): Promise<void> {
    if (!token) return;
    const current = await this.store.findByHash(sha256(token));
    if (!current || current.subjectType !== subjectType) return;
    await this.store.revokeFamily(current.familyId, this.now());
  }

  revokeAll(subjectType: SubjectType, subjectId: string): Promise<void> {
    return this.store.revokeAllForSubject(subjectType, subjectId, this.now());
  }
}
