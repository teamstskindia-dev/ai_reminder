import { AppException } from '../../common/errors/app.exception';
import { securityLog } from '../../common/logging/security-log';
import { sha256 } from '../../common/utils/crypto.util';

/** Minimal Redis-like store (ioredis in production, in-memory fake in tests). */
export interface ThrottleStore {
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
  setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
  ttl(key: string): Promise<number>;
  del(...keys: string[]): Promise<void>;
}

export interface LoginThrottleOptions {
  maxFailures: number;
  windowSeconds: number;
  lockSeconds: number;
}

export const DEFAULT_LOGIN_THROTTLE: LoginThrottleOptions = {
  maxFailures: 5,
  windowSeconds: 15 * 60,
  lockSeconds: 15 * 60,
};

const keys = (ip: string, email: string) => {
  const emailId = sha256(email.trim().toLowerCase()).slice(0, 32);
  return {
    failIp: `login-fail:ip:${ip}`,
    failEmail: `login-fail:email:${emailId}`,
    lockIp: `login-lock:ip:${ip}`,
    lockEmail: `login-lock:email:${emailId}`,
  };
};

/**
 * Admin login brute-force protection: failures are counted per IP and per email; reaching
 * `maxFailures` within `windowSeconds` locks that IP/email for `lockSeconds` (429 RATE_LIMITED).
 * Unknown emails count the same way, so lockouts never reveal which accounts exist.
 */
export class LoginThrottle {
  constructor(
    private readonly store: ThrottleStore,
    private readonly opts: LoginThrottleOptions = DEFAULT_LOGIN_THROTTLE,
  ) {}

  async assertNotLocked(ip: string, email: string): Promise<void> {
    const k = keys(ip, email);
    const [ipTtl, emailTtl] = await Promise.all([this.store.ttl(k.lockIp), this.store.ttl(k.lockEmail)]);
    const remaining = Math.max(ipTtl, emailTtl);
    if (remaining > 0) {
      throw AppException.rateLimited(
        `Too many failed sign-in attempts. Try again in ${Math.ceil(remaining / 60)} minute(s).`,
        remaining,
      );
    }
  }

  /** Records a failed attempt; returns true when this failure triggered a lockout. */
  async recordFailure(ip: string, email: string): Promise<boolean> {
    const k = keys(ip, email);
    const [ipFails, emailFails] = await Promise.all([
      this.store.incrWithTtl(k.failIp, this.opts.windowSeconds),
      this.store.incrWithTtl(k.failEmail, this.opts.windowSeconds),
    ]);
    securityLog('admin_login_failed', { ip, ipFailures: ipFails, emailFailures: emailFails });
    let locked = false;
    if (ipFails >= this.opts.maxFailures) {
      await this.store.setWithTtl(k.lockIp, '1', this.opts.lockSeconds);
      await this.store.del(k.failIp);
      locked = true;
    }
    if (emailFails >= this.opts.maxFailures) {
      await this.store.setWithTtl(k.lockEmail, '1', this.opts.lockSeconds);
      await this.store.del(k.failEmail);
      locked = true;
    }
    if (locked) securityLog('admin_login_locked', { ip, lockSeconds: this.opts.lockSeconds });
    return locked;
  }

  async recordSuccess(ip: string, email: string): Promise<void> {
    const k = keys(ip, email);
    await this.store.del(k.failEmail, k.failIp);
  }
}
