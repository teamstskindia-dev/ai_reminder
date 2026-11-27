import type { Redis } from 'ioredis';
import { AppException } from '../../common/errors/app.exception';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { monthKey, UploadQuotaService } from './upload-quota.service';
import type { UsersRepository } from './users.repository';

const USER = 'user-1';

/** Just enough of ioredis for the counter: GET, DECRBY and MULTI(SET NX, INCRBY). */
function fakeRedis() {
  const store = new Map<string, number>();
  const redis = {
    store,
    get: jest.fn((key: string) => Promise.resolve(store.has(key) ? String(store.get(key)) : null)),
    decrby: jest.fn((key: string, by: number) => {
      store.set(key, (store.get(key) ?? 0) - by);
      return Promise.resolve(store.get(key));
    }),
    multi: jest.fn(() => {
      const ops: (() => [null, unknown])[] = [];
      const chain = {
        // Called as set(key, '0', 'EX', ttl, 'NX'): only the NX behaviour matters here.
        set: (key: string, value: string) => {
          ops.push(() => {
            if (!store.has(key)) store.set(key, Number(value));
            return [null, 'OK'];
          });
          return chain;
        },
        incrby: (key: string, by: number) => {
          ops.push(() => {
            store.set(key, (store.get(key) ?? 0) + by);
            return [null, store.get(key)];
          });
          return chain;
        },
        exec: () => Promise.resolve(ops.map((op) => op())),
      };
      return chain;
    }),
  };
  return redis;
}

function setup(opts: { limitMinutes: number | null; pendingUploads?: number }) {
  const redis = fakeRedis();
  const users = {
    planLimits: jest.fn(() =>
      Promise.resolve({ meetingsPerMonth: null, aiQueriesPerDay: null, uploadMinutesPerMonth: opts.limitMinutes }),
    ),
  };
  const prisma = { meeting: { count: jest.fn(() => Promise.resolve(opts.pendingUploads ?? 0)) } };
  const service = new UploadQuotaService(
    users as unknown as UsersRepository,
    prisma as unknown as PrismaService,
    redis as unknown as Redis,
  );
  const key = `quota:upload:${USER}:${monthKey(new Date())}`;
  return { service, redis, prisma, key };
}

async function planLimitError(promise: Promise<unknown>): Promise<AppException> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppException);
  expect((err as AppException).code).toBe('PLAN_LIMIT_REACHED');
  return err as AppException;
}

describe('UploadQuotaService', () => {
  it('keys the counter by UTC month', () => {
    expect(monthKey(new Date('2026-11-30T23:59:59Z'))).toBe('2026-11');
    expect(monthKey(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12');
  });

  describe('consume (recorded conversation on finish)', () => {
    it('charges a recording that fits in what is left', async () => {
      const { service, redis, key } = setup({ limitMinutes: 60 });
      await service.consume(USER, 30 * 60);
      await service.consume(USER, 30 * 60);
      expect(redis.store.get(key)).toBe(3600);
    });

    it('refuses a recording longer than what is left and charges nothing', async () => {
      const { service, redis, key } = setup({ limitMinutes: 60 });
      await service.consume(USER, 50 * 60);
      const err = await planLimitError(service.consume(USER, 20 * 60));
      expect(err.message).toContain('10 minutes of audio left');
      expect(redis.store.get(key)).toBe(50 * 60);
    });

    it('says the month is used up when nothing is left', async () => {
      const { service } = setup({ limitMinutes: 1 });
      await service.consume(USER, 60);
      const err = await planLimitError(service.consume(USER, 5));
      expect(err.message).toContain('used all 1 minute');
    });

    it('never refuses on an unlimited plan, but still counts', async () => {
      const { service, redis, key } = setup({ limitMinutes: null });
      await service.consume(USER, 100 * 3600);
      expect(redis.store.get(key)).toBe(100 * 3600);
    });

    it('gives the seconds back through the returned refund', async () => {
      const { service, redis, key } = setup({ limitMinutes: 60 });
      const refund = await service.consume(USER, 600);
      await refund();
      expect(redis.store.get(key)).toBe(0);
    });
  });

  describe('assertCanUpload (audio of unknown length)', () => {
    it('allows uploads while minutes are left', async () => {
      const { service } = setup({ limitMinutes: 60 });
      await service.record(USER, 59 * 60);
      await expect(service.assertCanUpload(USER, { checkPendingUploads: true })).resolves.toBeUndefined();
    });

    it('refuses once the month is used up (a transcribed file may go past the limit)', async () => {
      const { service } = setup({ limitMinutes: 60 });
      await service.record(USER, 75 * 60);
      await planLimitError(service.assertCanUpload(USER));
    });

    it('refuses a new audio upload while another is still being transcribed', async () => {
      const { service } = setup({ limitMinutes: 60, pendingUploads: 1 });
      const err = await planLimitError(service.assertCanUpload(USER, { checkPendingUploads: true }));
      expect(err.message).toContain('still being processed');
    });

    it('does not look at pending uploads for capture parts', async () => {
      const { service, prisma } = setup({ limitMinutes: 60, pendingUploads: 1 });
      await expect(service.assertCanUpload(USER)).resolves.toBeUndefined();
      expect(prisma.meeting.count).not.toHaveBeenCalled();
    });

    it('skips every check on an unlimited plan', async () => {
      const { service, prisma } = setup({ limitMinutes: null, pendingUploads: 3 });
      await service.record(USER, 1000 * 60);
      await expect(service.assertCanUpload(USER, { checkPendingUploads: true })).resolves.toBeUndefined();
      expect(prisma.meeting.count).not.toHaveBeenCalled();
    });
  });
});
