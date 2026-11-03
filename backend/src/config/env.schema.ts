import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return def;
      if (typeof v === 'boolean') return v;
      return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
    });

const int = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === '') return def;
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: `must be an integer between ${min} and ${max}` });
        return z.NEVER;
      }
      return n;
    });

const list = (def: string[]) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v.trim() === ''
        ? def
        : v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    );

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

const secret = (name: string) =>
  z.string({ error: `${name} is required` }).min(32, `${name} must be at least 32 characters`);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: int(4000, 1, 65535),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    API_PUBLIC_URL: z.url().default('http://localhost:4000'),
    WEB_URL: z.url().default('http://localhost:3000'),
    ADMIN_URL: z.url().default('http://localhost:3001'),
    CORS_ORIGINS: list([]),
    COOKIE_DOMAIN: optionalString,
    COOKIE_SECURE: bool(false),
    /** Express `trust proxy`: false | true | hop count | comma list of subnets (e.g. "loopback, 10.0.0.0/8"). */
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((v): boolean | number | string => {
        const t = (v ?? '').trim();
        if (t === '' || t === 'false') return false;
        if (t === 'true') return true;
        if (/^\d+$/.test(t)) return Number(t);
        return t;
      }),
    SWAGGER_ENABLED: z
      .enum(['true', 'false', ''])
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
    JSON_BODY_LIMIT: z.string().default('1mb'),

    DATABASE_URL: z
      .string({ error: 'DATABASE_URL is required (Supabase pooled connection, port 6543)' })
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgresql:// connection string'),
    DIRECT_URL: optionalString,
    DATABASE_POOL_MAX: int(10, 1, 100),

    // Supabase is only used for Storage (recordings bucket); both are optional.
    SUPABASE_URL: optionalString.pipe(z.url().optional()),
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    SUPABASE_RECORDINGS_BUCKET: z.string().default('recordings'),

    REDIS_URL: z.string().default('redis://localhost:6379'),

    JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
    ADMIN_JWT_ACCESS_SECRET: secret('ADMIN_JWT_ACCESS_SECRET'),
    JWT_ACCESS_TTL_SECONDS: int(900, 60, 86400),
    REFRESH_TOKEN_TTL_DAYS: int(30, 1, 365),
    OAUTH_STATE_SECRET: secret('OAUTH_STATE_SECRET'),
    ENCRYPTION_KEY: z
      .string({ error: 'ENCRYPTION_KEY is required (base64 of 32 random bytes)' })
      .refine((v) => Buffer.from(v, 'base64').length === 32, {
        message: 'ENCRYPTION_KEY must be base64 of exactly 32 bytes (openssl rand -base64 32)',
      }),

    GOOGLE_CLIENT_ID: z.string({ error: 'GOOGLE_CLIENT_ID is required' }).min(1),
    GOOGLE_CLIENT_SECRET: z.string({ error: 'GOOGLE_CLIENT_SECRET is required' }).min(1),
    GOOGLE_REDIRECT_URI: z.url().default('http://localhost:4000/api/v1/auth/google/callback'),
    /** Default: remi:// + exp:// (Expo Go) in development, remi:// only in production. */
    MOBILE_REDIRECT_ALLOWLIST: list([]),

    GEMINI_API_KEY: optionalString,
    AI_MOCK: bool(false),

    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,

    SMTP_HOST: optionalString,
    SMTP_PORT: int(587, 1, 65535),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,

    EXPO_ACCESS_TOKEN: optionalString,

    ADMIN_SEED_EMAIL: optionalString,
    ADMIN_SEED_PASSWORD: optionalString,
    ADMIN_SEED_NAME: z.string().default('Super Admin'),

    WEB_REVALIDATE_URL: optionalString,
    WEB_REVALIDATE_SECRET: optionalString,

    BOT_MODE: z.enum(['puppeteer', 'simulate']).default('simulate'),
    BOT_CONCURRENCY: int(1, 1, 10),
    CHROME_PATH: z.string().default('/usr/bin/chromium'),
    CALENDAR_SYNC_INTERVAL_MINUTES: int(10, 1, 1440),
  })
  .superRefine((env, ctx) => {
    if (!env.AI_MOCK && !env.GEMINI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message: 'GEMINI_API_KEY is required unless AI_MOCK=true',
      });
    }
    if (env.ADMIN_SEED_PASSWORD && env.ADMIN_SEED_PASSWORD.length < 12) {
      ctx.addIssue({
        code: 'custom',
        path: ['ADMIN_SEED_PASSWORD'],
        message: 'ADMIN_SEED_PASSWORD must be at least 12 characters',
      });
    }
    if (env.CORS_ORIGINS.some((o) => o.includes('*'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS must list exact origins (no "*")',
      });
    }
    if (env.NODE_ENV === 'production') {
      for (const key of ['JWT_ACCESS_SECRET', 'ADMIN_JWT_ACCESS_SECRET', 'OAUTH_STATE_SECRET'] as const) {
        if (isWeakSecret(env[key])) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is an example/weak value; generate a random secret`,
          });
        }
      }
      if (new Set([env.JWT_ACCESS_SECRET, env.ADMIN_JWT_ACCESS_SECRET, env.OAUTH_STATE_SECRET]).size < 3) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_ACCESS_SECRET'],
          message: 'JWT, admin JWT and OAuth state secrets must differ',
        });
      }
      if (EXAMPLE_ENCRYPTION_KEYS.has(env.ENCRYPTION_KEY)) {
        ctx.addIssue({ code: 'custom', path: ['ENCRYPTION_KEY'], message: 'ENCRYPTION_KEY is the example value' });
      }
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'COOKIE_SECURE must be true in production' });
      }
      if (env.MOBILE_REDIRECT_ALLOWLIST.some((e) => e.toLowerCase().startsWith('exp:'))) {
        ctx.addIssue({
          code: 'custom',
          path: ['MOBILE_REDIRECT_ALLOWLIST'],
          message:
            'exp:// (Expo Go) redirects must not be allowed in production: any Expo project could receive sign-in codes',
        });
      }
      if (env.AI_MOCK) {
        ctx.addIssue({ code: 'custom', path: ['AI_MOCK'], message: 'AI_MOCK must be false in production' });
      }
    }
  });

/** Values shipped in .env.example (and obvious placeholders) are rejected in production. */
export const EXAMPLE_SECRETS = new Set([
  'change-me-user-jwt-secret-at-least-32-characters-long',
  'change-me-admin-jwt-secret-at-least-32-characters-long',
  'change-me-oauth-state-secret-at-least-32-characters',
]);
export const EXAMPLE_ENCRYPTION_KEYS = new Set([
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
]);

export function isWeakSecret(value: string): boolean {
  const v = value.trim();
  return (
    v.length < 32 ||
    EXAMPLE_SECRETS.has(v) ||
    /^(change-?me|example|secret|password|test|dev)/i.test(v) ||
    new Set(v).size < 8
  );
}

export type Env = z.output<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}\nSee backend/.env.example.`);
  }
  return result.data;
}
