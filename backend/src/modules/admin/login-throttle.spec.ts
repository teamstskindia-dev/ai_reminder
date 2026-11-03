import { Logger } from '@nestjs/common';
import { AppException, RateLimitedError } from '../../common/errors/app.exception';
import { LoginThrottle, ThrottleStore } from './login-throttle';

/** Redis-like store with TTLs driven by a manual clock (seconds). */
class FakeStore implements ThrottleStore {
  now = 0;
  private readonly data = new Map<string, { value: string; expiresAt: number }>();

  private alive(key: string) {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  /** INCR + EXPIRE NX: the window starts at the first failure. */
  incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.alive(key);
    if (!entry) {
      this.data.set(key, { value: '1', expiresAt: this.now + ttlSeconds });
      return Promise.resolve(1);
    }
    entry.value = String(Number(entry.value) + 1);
    return Promise.resolve(Number(entry.value));
  }

  setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.data.set(key, { value, expiresAt: this.now + ttlSeconds });
    return Promise.resolve();
  }

  ttl(key: string): Promise<number> {
    const entry = this.alive(key);
    return Promise.resolve(entry ? entry.expiresAt - this.now : -2);
  }

  del(...keys: string[]): Promise<void> {
    for (const k of keys) this.data.delete(k);
    return Promise.resolve();
  }

  keys(): string[] {
    return [...this.data.keys()];
  }
}

const IP = '203.0.113.7';
const EMAIL = 'admin@example.com';

async function lockError(promise: Promise<unknown>): Promise<RateLimitedError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(RateLimitedError);
    return err as RateLimitedError;
  }
  throw new Error('expected a lockout');
}

describe('LoginThrottle', () => {
  let store: FakeStore;
  let throttle: LoginThrottle;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    store = new FakeStore();
    throttle = new LoginThrottle(store);
  });

  const fail = (times: number, ip = IP, email = EMAIL) =>
    (async () => {
      const results: boolean[] = [];
      for (let i = 0; i < times; i++) results.push(await throttle.recordFailure(ip, email));
      return results;
    })();

  it('does not lock after 4 failures', async () => {
    expect(await fail(4)).toEqual([false, false, false, false]);
    await expect(throttle.assertNotLocked(IP, EMAIL)).resolves.toBeUndefined();
  });

  it('locks on the 5th failure with 429 RATE_LIMITED and Retry-After ≈ 900', async () => {
    expect(await fail(5)).toEqual([false, false, false, false, true]);
    const err = await lockError(throttle.assertNotLocked(IP, EMAIL));
    expect(err).toBeInstanceOf(AppException);
    expect(err.getStatus()).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.headers['Retry-After']).toBe('900');
    expect(err.message).toContain('15 minute');
  });

  it('locks an IP across different emails', async () => {
    for (let i = 0; i < 5; i++) await throttle.recordFailure(IP, `user${i}@example.com`);
    await lockError(throttle.assertNotLocked(IP, 'someone-new@example.com'));
    await expect(throttle.assertNotLocked('198.51.100.1', 'someone-new@example.com')).resolves.toBeUndefined();
  });

  it('locks an email across different IPs', async () => {
    for (let i = 0; i < 5; i++) await throttle.recordFailure(`198.51.100.${i}`, EMAIL);
    await lockError(throttle.assertNotLocked('192.0.2.99', EMAIL));
    await expect(throttle.assertNotLocked('192.0.2.99', 'other@example.com')).resolves.toBeUndefined();
  });

  it('recordSuccess clears the failure counters', async () => {
    await fail(4);
    await throttle.recordSuccess(IP, EMAIL);
    expect(await fail(4)).toEqual([false, false, false, false]);
    await expect(throttle.assertNotLocked(IP, EMAIL)).resolves.toBeUndefined();
    expect(await fail(1)).toEqual([true]);
  });

  it('the lock expires after lockSeconds', async () => {
    await fail(5);
    store.now += 100;
    const err = await lockError(throttle.assertNotLocked(IP, EMAIL));
    expect(err.headers['Retry-After']).toBe('800');
    expect(err.message).toContain('14 minute');
    store.now += 799;
    expect((await lockError(throttle.assertNotLocked(IP, EMAIL))).headers['Retry-After']).toBe('1');
    store.now += 1;
    await expect(throttle.assertNotLocked(IP, EMAIL)).resolves.toBeUndefined();
  });

  it('failures outside the window do not accumulate', async () => {
    await fail(4);
    store.now += 15 * 60 + 1;
    expect(await fail(4)).toEqual([false, false, false, false]);
    await expect(throttle.assertNotLocked(IP, EMAIL)).resolves.toBeUndefined();
  });

  it('counting restarts after a lockout', async () => {
    await fail(5);
    store.now += 900;
    expect(await fail(4)).toEqual([false, false, false, false]);
  });

  it('treats emails case-insensitively (and trims them)', async () => {
    const variants = ['Admin@Example.com', 'ADMIN@EXAMPLE.COM', ' admin@example.com ', 'admin@EXAMPLE.com', EMAIL];
    for (let i = 0; i < variants.length; i++) await throttle.recordFailure(`198.51.100.${i}`, variants[i]);
    await lockError(throttle.assertNotLocked('192.0.2.1', 'AdMiN@example.COM'));
  });

  it('never stores the raw email in keys', async () => {
    await fail(5);
    expect(store.keys().join(' ')).not.toContain(EMAIL);
    expect(store.keys().some((k) => k.includes(IP))).toBe(true);
  });

  it('respects custom options', async () => {
    throttle = new LoginThrottle(store, {
      maxFailures: 2,
      windowSeconds: 60,
      lockSeconds: 30,
    });
    expect(await fail(2)).toEqual([false, true]);
    expect((await lockError(throttle.assertNotLocked(IP, EMAIL))).headers['Retry-After']).toBe('30');
  });
});
