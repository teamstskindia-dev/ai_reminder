import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../../config/app-config';
import type { RealtimeEmitter } from '../../infra/realtime/realtime-emitter.service';
import { storedRecordingPaths } from '../../common/files/recording-files';
import { deleteInBatches } from './session-cleanup.service';
import { UserAccessBlocklist } from './user-access-blocklist';

const realtime = { disconnectUser: jest.fn() };

function blocklist(redis: Partial<Record<'get' | 'set', jest.Mock>>) {
  const config = { jwt: { accessTtlSeconds: 900 } } as unknown as AppConfig;
  return new UserAccessBlocklist(redis as unknown as Redis, config, realtime as unknown as RealtimeEmitter);
}

describe('UserAccessBlocklist', () => {
  it('rejects tokens issued up to the block and accepts later ones', async () => {
    const store = new Map<string, string>();
    const redis = {
      set: jest.fn((k: string, v: string) => Promise.resolve(store.set(k, v) && 'OK')),
      get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    };
    const list = blocklist(redis);
    await list.block('user-1', new Date(1_000_000 * 1000));

    expect(redis.set).toHaveBeenCalledWith('user-blocked-at:user-1', '1000000', 'EX', 960);
    expect(realtime.disconnectUser).toHaveBeenCalledWith('user-1');
    await expect(list.isBlocked('user-1', 999_999)).resolves.toBe(true);
    await expect(list.isBlocked('user-1', 1_000_000)).resolves.toBe(true);
    await expect(list.isBlocked('user-1', undefined)).resolves.toBe(true);
    await expect(list.isBlocked('user-1', 1_000_001)).resolves.toBe(false);
    await expect(list.isBlocked('user-2', 1)).resolves.toBe(false);
  });

  it('fails open when Redis is unreachable', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const list = blocklist({ get: jest.fn(() => Promise.reject(new Error('ECONNREFUSED'))) });
    await expect(list.isBlocked('user-1', 1)).resolves.toBe(false);
    jest.restoreAllMocks();
  });
});

describe('deleteInBatches', () => {
  it('stops at the first short batch', async () => {
    const sizes = [100, 100, 40];
    const del = jest.fn(() => Promise.resolve(sizes.shift() ?? 0));
    await expect(deleteInBatches(del, 100, 10)).resolves.toEqual({ deleted: 240, complete: true });
    expect(del).toHaveBeenCalledTimes(3);
  });

  it('caps one run and reports that work is left', async () => {
    const del = jest.fn(() => Promise.resolve(100));
    await expect(deleteInBatches(del, 100, 3)).resolves.toEqual({ deleted: 300, complete: false });
    expect(del).toHaveBeenCalledTimes(3);
  });
});

describe('storedRecordingPaths', () => {
  it('lists capture parts and the uploaded recording, once each', () => {
    const parts = [
      { index: 1, path: 'u/m/part-001.m4a', durationMs: 1 },
      { index: 0, path: 'u/m/part-000.m4a', durationMs: 1 },
      { bogus: true },
    ];
    expect(storedRecordingPaths({ recordingPath: 'u/m/recording.mp3', recordingParts: parts })).toEqual([
      'u/m/part-000.m4a',
      'u/m/part-001.m4a',
      'u/m/recording.mp3',
    ]);
    expect(storedRecordingPaths({ recordingPath: null, recordingParts: null })).toEqual([]);
  });
});
