import type { RedisOptions } from 'ioredis';

export const REDIS = Symbol('REDIS');

/** Converts redis://user:pass@host:port/db (or rediss://) into ioredis options (used by BullMQ too). */
export function redisOptionsFromUrl(url: string): RedisOptions {
  const u = new URL(url);
  const db = u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : 0;
  return {
    host: u.hostname || 'localhost',
    port: u.port ? Number(u.port) : 6379,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: Number.isFinite(db) ? db : 0,
    tls: u.protocol === 'rediss:' ? {} : undefined,
  };
}

export const RedisKeys = {
  otc: (code: string) => `otc:${code}`,
  googlePkce: (nonce: string) => `oauth-pkce:${nonce}`,
  loginFail: (kind: 'ip' | 'email', id: string) => `login-fail:${kind}:${id}`,
  loginLock: (kind: 'ip' | 'email', id: string) => `login-lock:${kind}:${id}`,
  botLeave: (meetingId: string) => `bot-leave:${meetingId}`,
  aiQuota: (userId: string, day: string) => `quota:ai:${userId}:${day}`,
  publicConfig: (platform: string) => `cfg:public:${platform}`,
  sections: (page: string, platform: string) => `cfg:sections:${page}:${platform}`,
  page: (slug: string) => `cfg:page:${slug}`,
  plans: () => 'cfg:plans',
  setting: (key: string) => `cfg:settings:${key}`,
  templates: () => 'cfg:templates',
  prompts: () => 'cfg:prompts',
};
