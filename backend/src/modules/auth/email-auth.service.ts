import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { securityLog } from '../../common/logging/security-log';
import { safeEqual, sha256 } from '../../common/utils/crypto.util';
import { MailService } from '../../infra/mail/mail.service';
import { incrWithTtl } from '../../infra/redis/redis-counter';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';
import { SettingsService } from '../content/settings.service';
import { UsersRepository } from '../users/users.repository';

const CODE_TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;

/** The stored value is the code hash. Codes issued before attempts moved to their own key were `{ hash, attempts }`. */
function storedHash(raw: string): string | null {
  if (!raw.startsWith('{')) return raw;
  try {
    const hash = (JSON.parse(raw) as { hash?: unknown }).hash;
    return typeof hash === 'string' ? hash : null;
  } catch {
    return null;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}***@${domain ?? ''}`;
}

/**
 * Passwordless email sign-in (user-flow §02 "Sign up with … email"): a 6-digit code, valid for 10 minutes,
 * single use, at most 5 attempts and 5 codes per address per hour. Only a hash is stored. Without SMTP
 * (development) the code is written to the API log instead of being emailed.
 *
 * Attempts are counted atomically *before* the comparison, so parallel guesses cannot get past the limit, and
 * a code is consumed by whichever request deletes it first, so it signs in exactly once.
 */
@Injectable()
export class EmailAuthService {
  private readonly logger = new Logger(EmailAuthService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly users: UsersRepository,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private hash(email: string, code: string): string {
    return sha256(`${email}:${code}:${this.config.encryptionKey.toString('base64')}`);
  }

  async start(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const id = sha256(email);
    const rateKey = RedisKeys.emailCodeRate(id);
    const sent = await incrWithTtl(this.redis, rateKey, 3600);
    if (sent > MAX_CODES_PER_HOUR) {
      throw AppException.rateLimited('Too many codes requested. Try again in an hour.', 3600);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeKey = RedisKeys.emailCode(id);
    await this.redis.set(codeKey, this.hash(email, code), 'EX', CODE_TTL_SECONDS);
    // A new code gets a fresh set of attempts.
    await this.redis.del(RedisKeys.emailCodeAttempts(id));

    /** Nothing reached the user: forget the code and give the hourly allowance back. */
    const release = async () => {
      await this.redis.del(codeKey);
      await this.redis.decr(rateKey);
    };

    const [notif, branding] = await Promise.all([this.settings.get('notifications'), this.settings.get('branding')]);
    if (!this.mail.configured || !notif.emailEnabled) {
      if (this.config.isProduction) {
        await release();
        throw AppException.upstream('smtp', undefined, 'Email sign-in is not available right now. Use Google instead.');
      }
      // Development only: there is no mail server, so the code goes to the API log.
      this.logger.warn(`[dev] Sign-in code for ${maskEmail(email)}: ${code} (configure SMTP to email it)`);
      return;
    }
    try {
      await this.mail.send({
        to: email,
        subject: `${code} is your ${branding.appName} sign-in code`,
        markdown: `Your ${branding.appName} sign-in code is:\n\n## ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
        text: `Your ${branding.appName} sign-in code is ${code}. It expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
        fromName: notif.fromName,
        fromEmail: notif.fromEmail,
      });
    } catch (err) {
      await release().catch(() => undefined);
      throw err;
    }
  }

  /** Checks the code and returns the (possibly new) user. */
  async verify(rawEmail: string, code: string): Promise<{ userId: string; isNewUser: boolean }> {
    const email = normalizeEmail(rawEmail);
    const id = sha256(email);
    const key = RedisKeys.emailCode(id);
    const attemptsKey = RedisKeys.emailCodeAttempts(id);

    // Count first: only the first MAX_ATTEMPTS requests per code are ever compared, however many run in parallel.
    const attempts = await incrWithTtl(this.redis, attemptsKey, CODE_TTL_SECONDS);
    if (attempts > MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw AppException.unauthorized('Too many wrong codes. Ask for a new one.');
    }
    const raw = await this.redis.get(key);
    const hash = raw ? storedHash(raw) : null;
    if (!hash) throw AppException.unauthorized('This code has expired. Ask for a new one.');
    if (!safeEqual(hash, this.hash(email, code))) {
      securityLog('email_code_failed', { attempts });
      if (attempts >= MAX_ATTEMPTS) {
        await this.redis.del(key);
        throw AppException.unauthorized('Too many wrong codes. Ask for a new one.');
      }
      throw AppException.unauthorized("That code isn't right. Check the email and try again.");
    }
    // Single use: only the request that actually deletes the code signs in.
    if ((await this.redis.del(key)) !== 1) {
      throw AppException.unauthorized('This code has already been used. Ask for a new one.');
    }
    await this.redis.del(attemptsKey);

    const now = new Date();
    const existing = await this.users.findByEmail(email);
    if (existing) {
      if (existing.status === 'suspended') throw AppException.forbidden('Your account is suspended');
      await this.users.update(existing.id, { lastLoginAt: now });
      return { userId: existing.id, isNewUser: false };
    }

    const features = await this.settings.get('features');
    if (!features.signupsEnabled) throw AppException.forbidden('New sign-ups are paused right now.');
    const [bot, notifications, planId] = await Promise.all([
      this.settings.get('bot'),
      this.settings.get('notifications'),
      this.users.defaultPlanId(),
    ]);
    const user = await this.users.createWithSettings(
      { email, planId, lastLoginAt: now },
      { autoJoin: bot.autoJoinDefault, meetingReminderMinutes: notifications.defaultMeetingReminderMinutes },
    );
    return { userId: user.id, isNewUser: true };
  }
}
