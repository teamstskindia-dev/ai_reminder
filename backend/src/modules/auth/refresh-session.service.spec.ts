import { AppException } from '../../common/errors/app.exception';
import { sha256 } from '../../common/utils/crypto.util';
import type { AuthSessionRow } from '../../infra/prisma/models';
import { AuthSessionsStore, NewSession, RefreshSessionService, SubjectType } from './refresh-session.service';

class FakeStore implements AuthSessionsStore {
  rows = new Map<string, AuthSessionRow>();
  /** When set, the next rotate() call behaves as if another request rotated first. */
  loseNextRace = false;

  insert(session: NewSession): Promise<AuthSessionRow> {
    const row: AuthSessionRow = {
      ...session,
      revokedAt: null,
      replacedBy: null,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    return Promise.resolve(row);
  }

  findByHash(tokenHash: string): Promise<AuthSessionRow | null> {
    return Promise.resolve([...this.rows.values()].find((r) => r.tokenHash === tokenHash) ?? null);
  }

  async rotate(currentId: string, next: NewSession, at: Date): Promise<AuthSessionRow | null> {
    const current = this.rows.get(currentId);
    if (this.loseNextRace) {
      this.loseNextRace = false;
      return null;
    }
    if (!current || current.revokedAt || current.replacedBy) return null;
    const created = await this.insert(next);
    current.revokedAt = at;
    current.replacedBy = created.id;
    return created;
  }

  revoke(id: string, at: Date): Promise<void> {
    const r = this.rows.get(id);
    if (r && !r.revokedAt) r.revokedAt = at;
    return Promise.resolve();
  }

  revokeFamily(familyId: string, at: Date): Promise<void> {
    for (const r of this.rows.values()) if (r.familyId === familyId && !r.revokedAt) r.revokedAt = at;
    return Promise.resolve();
  }

  revokeAllForSubject(subjectType: SubjectType, subjectId: string, at: Date): Promise<void> {
    for (const r of this.rows.values()) {
      if (r.subjectType === subjectType && r.subjectId === subjectId && !r.revokedAt) r.revokedAt = at;
    }
    return Promise.resolve();
  }
}

const ctx = { ip: '127.0.0.1', userAgent: 'jest' };
const USER_ID = '11111111-1111-4111-8111-111111111111';

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(AppException);
    expect(((err as AppException).getResponse() as { code: string }).code).toBe(code);
    return;
  }
  throw new Error(`Expected rejection with ${code}`);
}

describe('RefreshSessionService', () => {
  let store: FakeStore;
  let now: Date;
  let service: RefreshSessionService;

  beforeEach(() => {
    store = new FakeStore();
    now = new Date('2026-11-03T10:00:00.000Z');
    service = new RefreshSessionService(store, 30, () => now);
  });

  it('issues an opaque token and stores only its sha256 hash with the expiry', async () => {
    const { token, session } = await service.issue('user', USER_ID, ctx);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.tokenHash).toBe(sha256(token));
    expect(session.tokenHash).not.toBe(token);
    expect([...store.rows.values()].some((r) => r.tokenHash === token)).toBe(false);
    expect(session.expiresAt.toISOString()).toBe('2026-12-03T10:00:00.000Z');
    expect(session.subjectType).toBe('user');
    expect(session.subjectId).toBe(USER_ID);
    expect(session.ip).toBe('127.0.0.1');
    expect(session.userAgent).toBe('jest');
  });

  it('issues a new family for each sign-in', async () => {
    const a = await service.issue('user', USER_ID, ctx);
    const b = await service.issue('user', USER_ID, ctx);
    expect(a.session.familyId).not.toBe(b.session.familyId);
  });

  it('rotates: new token in the same family, old one marked as rotated', async () => {
    const first = await service.issue('user', USER_ID, ctx);
    const rotated = await service.rotate(first.token, 'user', ctx);
    expect(rotated.token).not.toBe(first.token);
    expect(rotated.subjectId).toBe(USER_ID);
    expect(rotated.session.familyId).toBe(first.session.familyId);
    const old = store.rows.get(first.session.id)!;
    expect(old.revokedAt).toEqual(now);
    expect(old.replacedBy).toBe(rotated.session.id);
    expect(store.rows.get(rotated.session.id)!.revokedAt).toBeNull();
  });

  it('allows a chain of rotations', async () => {
    const t1 = await service.issue('user', USER_ID, ctx);
    const t2 = await service.rotate(t1.token, 'user', ctx);
    const t3 = await service.rotate(t2.token, 'user', ctx);
    expect(t3.session.familyId).toBe(t1.session.familyId);
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const first = await service.issue('user', USER_ID, ctx);
    const second = await service.rotate(first.token, 'user', ctx);
    await expectCode(service.rotate(first.token, 'user', ctx), 'UNAUTHORIZED');
    for (const r of store.rows.values()) expect(r.revokedAt).not.toBeNull();
    // The legitimate newest token no longer works either.
    await expectCode(service.rotate(second.token, 'user', ctx), 'UNAUTHORIZED');
  });

  it('does not touch other families when reuse is detected', async () => {
    const other = await service.issue('user', USER_ID, ctx);
    const first = await service.issue('user', USER_ID, ctx);
    await service.rotate(first.token, 'user', ctx);
    await expectCode(service.rotate(first.token, 'user', ctx), 'UNAUTHORIZED');
    expect(store.rows.get(other.session.id)!.revokedAt).toBeNull();
  });

  it('rejects an expired token and revokes it', async () => {
    const first = await service.issue('user', USER_ID, ctx);
    now = new Date('2026-12-03T10:00:00.001Z');
    await expectCode(service.rotate(first.token, 'user', ctx), 'UNAUTHORIZED');
    expect(store.rows.get(first.session.id)!.revokedAt).toEqual(now);
  });

  it('rejects a token issued for another subject type', async () => {
    const admin = await service.issue('admin', USER_ID, ctx);
    await expectCode(service.rotate(admin.token, 'user', ctx), 'UNAUTHORIZED');
    expect(store.rows.get(admin.session.id)!.revokedAt).toBeNull();
  });

  it('rejects unknown and empty tokens', async () => {
    await expectCode(service.rotate('not-a-real-token', 'user', ctx), 'UNAUTHORIZED');
    await expectCode(service.rotate('', 'user', ctx), 'UNAUTHORIZED');
  });

  it('treats a lost rotation race as reuse and revokes the family', async () => {
    const first = await service.issue('user', USER_ID, ctx);
    store.loseNextRace = true;
    await expectCode(service.rotate(first.token, 'user', ctx), 'UNAUTHORIZED');
    expect(store.rows.get(first.session.id)!.revokedAt).toEqual(now);
  });

  it('logout revokes the family of the presented token and ignores unknown tokens', async () => {
    const first = await service.issue('user', USER_ID, ctx);
    const second = await service.rotate(first.token, 'user', ctx);
    await service.revoke(second.token, 'user');
    for (const r of store.rows.values()) expect(r.revokedAt).not.toBeNull();
    await expectCode(service.rotate(second.token, 'user', ctx), 'UNAUTHORIZED');
    await expect(service.revoke('unknown', 'user')).resolves.toBeUndefined();
    await expect(service.revoke(undefined, 'user')).resolves.toBeUndefined();
  });

  it('logout with a token of another subject type is a no-op', async () => {
    const admin = await service.issue('admin', USER_ID, ctx);
    await service.revoke(admin.token, 'user');
    expect(store.rows.get(admin.session.id)!.revokedAt).toBeNull();
  });

  it('revokeAll revokes every session of the subject only', async () => {
    const a = await service.issue('user', USER_ID, ctx);
    const b = await service.issue('user', USER_ID, ctx);
    const other = await service.issue('user', '22222222-2222-4222-8222-222222222222', ctx);
    const admin = await service.issue('admin', USER_ID, ctx);
    await service.revokeAll('user', USER_ID);
    expect(store.rows.get(a.session.id)!.revokedAt).not.toBeNull();
    expect(store.rows.get(b.session.id)!.revokedAt).not.toBeNull();
    expect(store.rows.get(other.session.id)!.revokedAt).toBeNull();
    expect(store.rows.get(admin.session.id)!.revokedAt).toBeNull();
  });
});
