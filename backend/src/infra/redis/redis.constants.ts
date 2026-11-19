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
  /** Keyed by sha256(email) so addresses never appear in key names. */
  emailCode: (emailHash: string) => `email-code:${emailHash}`,
  emailCodeRate: (emailHash: string) => `email-code-rate:${emailHash}`,
  loginFail: (kind: 'ip' | 'email', id: string) => `login-fail:${kind}:${id}`,
  loginLock: (kind: 'ip' | 'email', id: string) => `login-lock:${kind}:${id}`,
  botLeave: (meetingId: string) => `bot-leave:${meetingId}`,
  aiQuota: (userId: string, day: string) => `quota:ai:${userId}:${day}`,
  /** Exactly-once marker for a daily-rhythm job (morning brief, check-in, ...) per user and local day. */
  rhythm: (kind: string, userId: string, day: string) => `rhythm:${kind}:${userId}:${day}`,
  /** Connected-app OAuth attempt (single use): { userId, provider, redirect, verifier, mode }. */
  connectState: (nonce: string) => `connect-state:${nonce}`,
  /** Normal pushes sent on a local day (the daily push budget, user-flow §09). */
  pushBudget: (userId: string, day: string) => `push-budget:${userId}:${day}`,
  /** How many pushes were held back for one bundle push. */
  pushHeld: (userId: string, releaseAtMs: number) => `push-held:${userId}:${releaseAtMs}`,
  /** The same notification twice within a few minutes is merged into one. */
  notifDedupe: (userId: string, hash: string) => `notif-dedupe:${userId}:${hash}`,
  /** Important-email pushes in the current hour (inbox flood → batched). */
  emailPushes: (userId: string, hourKey: string) => `email-pushes:${userId}:${hourKey}`,
  emailHeld: (userId: string, hourKey: string) => `email-held:${userId}:${hourKey}`,
  /** One "reconnect" push per account and day. */
  reconnectNotice: (accountId: string, day: string) => `reconnect-notice:${accountId}:${day}`,
  publicConfig: (platform: string) => `cfg:public:${platform}`,
  sections: (page: string, platform: string) => `cfg:sections:${page}:${platform}`,
  page: (slug: string) => `cfg:page:${slug}`,
  plans: () => 'cfg:plans',
  setting: (key: string) => `cfg:settings:${key}`,
  templates: () => 'cfg:templates',
  prompts: () => 'cfg:prompts',
};
