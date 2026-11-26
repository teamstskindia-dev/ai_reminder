import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../../config/app-config';
import type { GoogleOAuthService } from '../../infra/google/google-oauth.service';
import type { MailService } from '../../infra/mail/mail.service';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { StorageService } from '../../infra/storage/storage.service';
import type { AuthSessionsRepository } from '../auth/auth-sessions.repository';
import type { UserAccessBlocklist } from '../auth/user-access-blocklist';
import type { SettingsService } from '../content/settings.service';
import { AccountDeletionService } from './account-deletion.service';
import type { GoogleAccountsRepository, UsersRepository } from './users.repository';

// The real MailService pulls in ESM-only `marked`; the tests pass their own double.
jest.mock('../../infra/mail/mail.service', () => ({ MailService: class {} }));

const USER = 'user-1';

function setup(opts: { pendingExport?: string } = {}) {
  const order: string[] = [];
  const users = {
    getById: jest.fn(() => Promise.resolve({ id: USER, email: 'asha@example.com', name: 'Asha Rao' })),
    delete: jest.fn(() => {
      order.push('delete-user');
      return Promise.resolve();
    }),
  };
  const sessions = {
    deleteAllForSubject: jest.fn(() => {
      order.push('delete-sessions');
      return Promise.resolve(3);
    }),
    revokeAllForSubject: jest.fn(),
  };
  const blocklist = {
    block: jest.fn(() => {
      order.push('block');
      return Promise.resolve();
    }),
  };
  const storage = { remove: jest.fn(() => Promise.resolve()) };
  const prisma = {
    userProfile: { findUnique: jest.fn(() => Promise.resolve(null)) },
    meeting: {
      findMany: jest.fn(() =>
        Promise.resolve([
          { id: 'm1', status: 'completed', recordingPath: `${USER}/m1/recording.mp3`, recordingParts: [] },
          // A capture whose processing failed keeps its audio parts.
          {
            id: 'm2',
            status: 'failed',
            recordingPath: null,
            recordingParts: [
              { index: 1, path: `${USER}/m2/part-001.m4a`, durationMs: 1000 },
              { index: 0, path: `${USER}/m2/part-000.m4a`, durationMs: 1000 },
            ],
          },
        ]),
      ),
    },
    reminder: { findMany: jest.fn(() => Promise.resolve([])) },
  };
  const redis = {
    get: jest.fn(() => Promise.resolve(opts.pendingExport ?? null)),
    set: jest.fn(),
    del: jest.fn(() => Promise.resolve(1)),
  };
  const queue = { getJob: jest.fn(() => Promise.resolve(null)) } as unknown as Queue;
  const service = new AccountDeletionService(
    users as unknown as UsersRepository,
    { find: jest.fn(() => Promise.resolve(null)) } as unknown as GoogleAccountsRepository,
    sessions as unknown as AuthSessionsRepository,
    blocklist as unknown as UserAccessBlocklist,
    { revoke: jest.fn() } as unknown as GoogleOAuthService,
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
    { encryptionKey: Buffer.alloc(32) } as unknown as AppConfig,
    { configured: false } as unknown as MailService,
    {} as unknown as SettingsService,
    redis as unknown as Redis,
    queue,
    queue,
    queue,
    queue,
  );
  return { service, order, storage, sessions };
}

describe('AccountDeletionService', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterAll(() => jest.restoreAllMocks());

  it('blocks the access tokens first and deletes the session rows before the user', async () => {
    const { service, order, sessions } = setup();
    await service.deleteUser(USER);
    expect(order).toEqual(['block', 'delete-sessions', 'delete-user']);
    expect(sessions.deleteAllForSubject).toHaveBeenCalledWith('user', USER);
    expect(sessions.revokeAllForSubject).not.toHaveBeenCalled();
  });

  it('removes uploaded recordings and capture audio parts', async () => {
    const { service, storage } = setup();
    await service.deleteUser(USER);
    expect(storage.remove).toHaveBeenCalledWith([
      `${USER}/m1/recording.mp3`,
      `${USER}/m2/part-000.m4a`,
      `${USER}/m2/part-001.m4a`,
    ]);
  });

  it('also removes a data export waiting to be downloaded', async () => {
    const { service, storage } = setup({ pendingExport: JSON.stringify({ path: `${USER}/export.json`, token: 't' }) });
    await service.deleteUser(USER);
    expect(storage.remove).toHaveBeenCalledWith(expect.arrayContaining([`${USER}/export.json`]));
  });
});
