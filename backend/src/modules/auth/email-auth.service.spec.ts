import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../../config/app-config';
import { RateLimitedError, UnauthorizedError } from '../../common/errors/app.exception';
import type { MailService } from '../../infra/mail/mail.service';
import type { SettingsService } from '../content/settings.service';
import type { UsersRepository } from '../users/users.repository';
import { EmailAuthService } from './email-auth.service';

// The real MailService pulls in ESM-only `marked`; the tests pass their own mail double.
jest.mock('../../infra/mail/mail.service', () => ({ MailService: class {} }));

/** The Redis commands EmailAuthService uses (TTLs are not modelled: tests finish well inside them). */
class FakeRedis {
  readonly data = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.data.get(key) ?? null);
  }

  set(key: string, value: string, ...args: unknown[]): Promise<'OK' | null> {
    if (args.includes('NX') && this.data.has(key)) return Promise.resolve(null);
    this.data.set(key, value);
    return Promise.resolve('OK');
  }

  del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.data.delete(k)) n++;
    return Promise.resolve(n);
  }

  private add(key: string, by: number): number {
    const next = Number(this.data.get(key) ?? '0') + by;
    this.data.set(key, String(next));
    return next;
  }

  incr(key: string): Promise<number> {
    return Promise.resolve(this.add(key, 1));
  }

  decr(key: string): Promise<number> {
    return Promise.resolve(this.add(key, -1));
  }

  multi() {
    const ops: (() => unknown)[] = [];
    const chain = {
      set: (key: string, value: string, ...args: unknown[]) => {
        ops.push(() => (args.includes('NX') && this.data.has(key) ? null : (this.data.set(key, value), 'OK')));
        return chain;
      },
      incr: (key: string) => {
        ops.push(() => this.add(key, 1));
        return chain;
      },
      exec: () => Promise.resolve(ops.map((op) => [null, op()] as [null, unknown])),
    };
    return chain;
  }
}

const EMAIL = 'asha@example.com';

function setup() {
  const redis = new FakeRedis();
  const sent: string[] = [];
  const mail = {
    configured: true,
    send: jest.fn((msg: { text: string }) => {
      sent.push(msg.text);
      return Promise.resolve();
    }),
  };
  const settings = {
    get: (key: string) =>
      Promise.resolve(
        (
          {
            notifications: { emailEnabled: true, fromName: 'Remi', fromEmail: 'hi@example.com' },
            branding: { appName: 'Remi' },
            features: { signupsEnabled: true },
          } as Record<string, unknown>
        )[key],
      ),
  };
  const users = {
    findByEmail: jest.fn(() => Promise.resolve({ id: 'user-1', status: 'active' })),
    update: jest.fn(() => Promise.resolve()),
  };
  const config = { encryptionKey: Buffer.alloc(32, 7), isProduction: false };
  const service = new EmailAuthService(
    config as unknown as AppConfig,
    mail as unknown as MailService,
    settings as unknown as SettingsService,
    users as unknown as UsersRepository,
    redis as unknown as Redis,
  );
  const lastCode = () => /code is (\d{6})/.exec(sent[sent.length - 1] ?? '')?.[1] as string;
  const wrongCode = () => (lastCode() === '000000' ? '111111' : '000000');
  return { service, redis, mail, lastCode, wrongCode };
}

describe('EmailAuthService', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterAll(() => jest.restoreAllMocks());

  it('signs in with the emailed code', async () => {
    const { service, lastCode } = setup();
    await service.start(EMAIL);
    await expect(service.verify(EMAIL, lastCode())).resolves.toEqual({ userId: 'user-1', isNewUser: false });
  });

  it('accepts a code only once, even when two requests race', async () => {
    const { service, lastCode } = setup();
    await service.start(EMAIL);
    const code = lastCode();
    const results = await Promise.allSettled([service.verify(EMAIL, code), service.verify(EMAIL, code)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(UnauthorizedError);
  });

  it('stops comparing after 5 attempts, even when the guesses arrive in parallel', async () => {
    const { service, lastCode, wrongCode } = setup();
    await service.start(EMAIL);
    const wrong = wrongCode();
    const results = await Promise.allSettled([
      ...Array.from({ length: 5 }, () => service.verify(EMAIL, wrong)),
      service.verify(EMAIL, lastCode()), // the right code, but as the 6th attempt
    ]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    await expect(service.verify(EMAIL, lastCode())).rejects.toThrow(/Too many wrong codes/);
  });

  it('gives a new code a fresh set of attempts', async () => {
    const { service, lastCode, wrongCode } = setup();
    await service.start(EMAIL);
    for (let i = 0; i < 4; i++) await expect(service.verify(EMAIL, wrongCode())).rejects.toThrow(/isn't right/);
    await service.start(EMAIL);
    for (let i = 0; i < 4; i++) await expect(service.verify(EMAIL, wrongCode())).rejects.toThrow(/isn't right/);
    await expect(service.verify(EMAIL, lastCode())).resolves.toMatchObject({ userId: 'user-1' });
  });

  it('limits codes to 5 per address per hour', async () => {
    const { service } = setup();
    for (let i = 0; i < 5; i++) await service.start(EMAIL);
    await expect(service.start(EMAIL)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('does not use up the hourly allowance when the email cannot be sent', async () => {
    const { service, mail, redis } = setup();
    mail.send.mockRejectedValueOnce(new Error('smtp down'));
    await expect(service.start(EMAIL)).rejects.toThrow('smtp down');
    expect([...redis.data.keys()].some((k) => k.startsWith('email-code:'))).toBe(false);
    for (let i = 0; i < 5; i++) await service.start(EMAIL);
    await expect(service.start(EMAIL)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('still accepts a code stored in the previous { hash, attempts } format', async () => {
    const { service, redis, lastCode } = setup();
    await service.start(EMAIL);
    const key = [...redis.data.keys()].find((k) => k.startsWith('email-code:')) as string;
    redis.data.set(key, JSON.stringify({ hash: redis.data.get(key), attempts: 0 }));
    await expect(service.verify(EMAIL, lastCode())).resolves.toMatchObject({ userId: 'user-1' });
  });
});
