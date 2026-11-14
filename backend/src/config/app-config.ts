import { Env, parseEnv } from './env.schema';

const DUMMY_VALUES = new Set(['', 'dummy', 'demo', 'changeme', 'your-key', 'xxx']);

/**
 * Typed, validated configuration. Constructed once per process from process.env.
 */
export class AppConfig {
  readonly env: Env;

  constructor(source: NodeJS.ProcessEnv = process.env) {
    this.env = parseEnv(source);
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get port(): number {
    return this.env.PORT;
  }

  get swaggerEnabled(): boolean {
    const flag = this.env.SWAGGER_ENABLED;
    return flag === undefined ? !this.isProduction : flag === 'true';
  }

  get trustProxy(): boolean | number | string {
    return this.env.TRUST_PROXY;
  }

  get jsonBodyLimit(): string {
    return this.env.JSON_BODY_LIMIT;
  }

  get corsOrigins(): string[] {
    const fromEnv = this.env.CORS_ORIGINS;
    return fromEnv.length > 0 ? fromEnv : [this.env.WEB_URL, this.env.ADMIN_URL];
  }

  get cookie() {
    return {
      domain: this.env.COOKIE_DOMAIN,
      secure: this.env.COOKIE_SECURE,
    };
  }

  get jwt() {
    return {
      userSecret: this.env.JWT_ACCESS_SECRET,
      adminSecret: this.env.ADMIN_JWT_ACCESS_SECRET,
      accessTtlSeconds: this.env.JWT_ACCESS_TTL_SECONDS,
      refreshTtlDays: this.env.REFRESH_TOKEN_TTL_DAYS,
      stateSecret: this.env.OAUTH_STATE_SECRET,
    };
  }

  get encryptionKey(): Buffer {
    return Buffer.from(this.env.ENCRYPTION_KEY, 'base64');
  }

  get apple() {
    return { clientIds: this.env.APPLE_CLIENT_IDS };
  }

  get google() {
    return {
      clientId: this.env.GOOGLE_CLIENT_ID,
      clientSecret: this.env.GOOGLE_CLIENT_SECRET,
      redirectUri: this.env.GOOGLE_REDIRECT_URI,
      mobileRedirectAllowlist: this.env.MOBILE_REDIRECT_ALLOWLIST.length
        ? this.env.MOBILE_REDIRECT_ALLOWLIST
        : this.isProduction
          ? ['remi://']
          : ['remi://', 'exp://'],
    };
  }

  get database() {
    return { url: this.env.DATABASE_URL, poolMax: this.env.DATABASE_POOL_MAX };
  }

  get supabase() {
    const url = this.env.SUPABASE_URL;
    const serviceRoleKey = this.env.SUPABASE_SERVICE_ROLE_KEY;
    return {
      url,
      serviceRoleKey,
      recordingsBucket: this.env.SUPABASE_RECORDINGS_BUCKET,
      storageConfigured: !!url && !!serviceRoleKey && !DUMMY_VALUES.has(serviceRoleKey.toLowerCase()),
    };
  }

  get redisUrl(): string {
    return this.env.REDIS_URL;
  }

  get ai() {
    return { apiKey: this.env.GEMINI_API_KEY, mock: this.env.AI_MOCK };
  }

  get cloudinary() {
    const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = this.env;
    const configured =
      !!cloudName &&
      !!apiKey &&
      !!apiSecret &&
      !DUMMY_VALUES.has(cloudName.toLowerCase()) &&
      !DUMMY_VALUES.has(apiKey.toLowerCase()) &&
      !DUMMY_VALUES.has(apiSecret.toLowerCase());
    return { cloudName, apiKey, apiSecret, configured };
  }

  get smtp() {
    const { SMTP_HOST: host, SMTP_PORT: port, SMTP_USER: user, SMTP_PASS: pass } = this.env;
    return { host, port, user, pass, configured: !!host };
  }

  get urls() {
    return {
      api: this.env.API_PUBLIC_URL.replace(/\/$/, ''),
      web: this.env.WEB_URL.replace(/\/$/, ''),
      admin: this.env.ADMIN_URL.replace(/\/$/, ''),
    };
  }

  get revalidate() {
    return { url: this.env.WEB_REVALIDATE_URL, secret: this.env.WEB_REVALIDATE_SECRET };
  }

  get adminSeed() {
    return {
      email: this.env.ADMIN_SEED_EMAIL,
      password: this.env.ADMIN_SEED_PASSWORD,
      name: this.env.ADMIN_SEED_NAME,
    };
  }

  get bot() {
    return {
      mode: this.env.BOT_MODE,
      concurrency: this.env.BOT_CONCURRENCY,
      chromePath: this.env.CHROME_PATH,
      profileDir: this.env.BOT_PROFILE_DIR,
    };
  }

  /** Recall.ai API (host per region) and webhook verification secret. Never log these values. */
  get recall() {
    const region = this.env.RECALL_REGION;
    return {
      apiKey: this.env.RECALL_API_KEY,
      region,
      baseUrl: `https://${region}.recall.ai`,
      webhookSecret: this.env.RECALL_WEBHOOK_SECRET,
      configured: !!this.env.RECALL_API_KEY,
      webhookConfigured: !!this.env.RECALL_WEBHOOK_SECRET,
    };
  }

  get calendarSyncIntervalMinutes(): number {
    return this.env.CALENDAR_SYNC_INTERVAL_MINUTES;
  }

  get expoAccessToken(): string | undefined {
    return this.env.EXPO_ACCESS_TOKEN;
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.env.LOG_LEVEL;
  }
}
