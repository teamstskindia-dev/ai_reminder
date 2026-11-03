import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import type { ClientContext } from '../../common/http/request.types';
import { securityLog } from '../../common/logging/security-log';
import type { AdminRole, AdminUser, AuthTokens } from '../../common/types/api.types';
import type { AdminRow } from '../../infra/prisma/models';
import { REDIS } from '../../infra/redis/redis.constants';
import { AdminsRepository } from '../auth/admins.repository';
import { RefreshSessionService } from '../auth/refresh-session.service';
import { TokenService } from '../auth/token.service';
import { UpdateAdminMeDto } from './dto/admin.dto';
import { LoginThrottle, ThrottleStore } from './login-throttle';

export const BCRYPT_COST = 12;
/** bcrypt hash of a random string; compared against for unknown emails so timing does not leak existence. */
const DUMMY_HASH = '$2b$12$NCVoZJtAbDLff1h8p/YhjesvLLD/bg/V6UwUU43Gf4I4nEjZr3zdC';

export function toAdminUser(row: AdminRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as AdminRole,
    status: row.status as AdminUser['status'],
    avatarUrl: row.avatarUrl,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

/** ioredis-backed store for LoginThrottle. */
export function redisThrottleStore(redis: Redis): ThrottleStore {
  return {
    async incrWithTtl(key, ttl) {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, ttl);
      return n;
    },
    async setWithTtl(key, value, ttl) {
      await redis.set(key, value, 'EX', ttl);
    },
    ttl: (key) => redis.ttl(key),
    async del(...keys) {
      if (keys.length) await redis.del(...keys);
    },
  };
}

@Injectable()
export class AdminAuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly throttle: LoginThrottle;

  constructor(
    private readonly admins: AdminsRepository,
    private readonly tokens: TokenService,
    private readonly sessions: RefreshSessionService,
    private readonly config: AppConfig,
    @Inject(REDIS) redis: Redis,
  ) {
    this.throttle = new LoginThrottle(redisThrottleStore(redis));
  }

  /** Creates the first super_admin from ADMIN_SEED_* when the admins table is empty (API boot). */
  async onApplicationBootstrap(): Promise<void> {
    const { email, password, name } = this.config.adminSeed;
    if (!email || !password) return;
    try {
      if ((await this.admins.count()) > 0) return;
      await this.admins.create({
        email: email.toLowerCase(),
        name,
        passwordHash: await hashPassword(password),
        role: 'super_admin',
      });
      this.logger.log('Seeded the initial super_admin from ADMIN_SEED_EMAIL');
    } catch (err) {
      this.logger.warn({ errName: (err as Error).name }, `Admin seed skipped: ${(err as Error).message}`);
    }
  }

  async login(email: string, password: string, ctx: ClientContext): Promise<{ admin: AdminUser; tokens: AuthTokens }> {
    const ip = ctx.ip ?? 'unknown';
    await this.throttle.assertNotLocked(ip, email);
    const admin = await this.admins.findByEmail(email.trim());
    const ok = await compare(password, admin?.passwordHash ?? DUMMY_HASH);
    if (!admin || !ok || admin.status !== 'active') {
      await this.throttle.recordFailure(ip, email);
      throw AppException.unauthorized('Invalid email or password');
    }
    await this.throttle.recordSuccess(ip, email);
    const updated = await this.admins.update(admin.id, { lastLoginAt: new Date() });
    return { admin: toAdminUser(updated), tokens: await this.issue(updated, ctx) };
  }

  async refresh(refreshToken: string | undefined, ctx: ClientContext): Promise<AuthTokens> {
    if (!refreshToken) throw AppException.unauthorized('Refresh token missing');
    const rotated = await this.sessions.rotate(refreshToken, 'admin', ctx);
    const admin = await this.admins.findById(rotated.subjectId);
    if (!admin || admin.status !== 'active') {
      await this.sessions.revokeAll('admin', rotated.subjectId);
      throw AppException.unauthorized('Admin account is not active');
    }
    return {
      accessToken: await this.tokens.signAdmin(admin.id, admin.role as AdminRole),
      refreshToken: rotated.token,
      expiresIn: this.tokens.accessTtlSeconds,
    };
  }

  logout(refreshToken: string | undefined): Promise<void> {
    return this.sessions.revoke(refreshToken, 'admin');
  }

  async updateMe(admin: AdminRow, dto: UpdateAdminMeDto): Promise<AdminUser> {
    const data: { name?: string; avatarUrl?: string | null; passwordHash?: string } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.newPassword !== undefined) {
      if (!dto.currentPassword || !(await compare(dto.currentPassword, admin.passwordHash))) {
        throw AppException.validation([{ field: 'currentPassword', messages: ['current password is incorrect'] }]);
      }
      data.passwordHash = await hashPassword(dto.newPassword);
    }
    const updated = await this.admins.update(admin.id, data);
    if (data.passwordHash) await this.revokeSessions(admin.id, 'password_change');
    return toAdminUser(updated);
  }

  async revokeSessions(adminId: string, reason: string): Promise<void> {
    await this.sessions.revokeAll('admin', adminId);
    securityLog('admin_sessions_revoked', { adminId, reason });
  }

  private async issue(admin: AdminRow, ctx: ClientContext): Promise<AuthTokens> {
    const [accessToken, refresh] = await Promise.all([
      this.tokens.signAdmin(admin.id, admin.role as AdminRole),
      this.sessions.issue('admin', admin.id, ctx),
    ]);
    return { accessToken, refreshToken: refresh.token, expiresIn: this.tokens.accessTtlSeconds };
  }
}
