import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { LoggerOptions } from 'pino';
import { RequestContext, sanitizeRequestId } from '../context/request-context';

/**
 * Keys that must never reach the logs (redacted at depth 0..3). OAuth/one-time `code` values are
 * redacted by explicit paths only, so error codes (`err.code`, contract codes) stay visible.
 */
export const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'password_hash',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'id_token',
  'access_token',
  'refresh_token',
  'oauthCode',
  'codeVerifier',
  'codeChallenge',
  'apiKey',
  'api_key',
  'secret',
  'clientSecret',
  'accessTokenEnc',
  'refreshTokenEnc',
  'access_token_enc',
  'refresh_token_enc',
  'expoPushToken',
  'GOOGLE_CLIENT_SECRET',
  'GEMINI_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'DIRECT_URL',
  'SMTP_PASS',
  'EXPO_ACCESS_TOKEN',
  'JWT_ACCESS_SECRET',
  'ADMIN_JWT_ACCESS_SECRET',
  'OAUTH_STATE_SECRET',
  'ENCRYPTION_KEY',
];

/** pino `redact` paths: request/response headers plus every sensitive key at depth 0..2. */
export function redactPaths(): string[] {
  const headerPaths = [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-revalidate-secret"]',
    'res.headers["set-cookie"]',
    'req.query.code',
    'req.query.state',
    'req.body.code',
    'body.code',
  ];
  const keyPaths = SENSITIVE_KEYS.flatMap((k) => {
    if (/^[A-Za-z_$][\w$]*$/.test(k)) return [k, `*.${k}`, `*.*.${k}`, `*.*.*.${k}`];
    // Non-identifier keys (e.g. "set-cookie") need bracket notation and cannot be top-level paths.
    return [`*["${k}"]`, `*.*["${k}"]`, `*.*.*["${k}"]`];
  });
  return [...new Set([...headerPaths, ...keyPaths])];
}

/** pino-pretty is a dev dependency: production images fall back to JSON even if NODE_ENV=development. */
export function prettyAvailable(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export function basePinoOptions(level: string, pretty: boolean): LoggerOptions {
  pretty = pretty && prettyAvailable();
  return {
    level,
    redact: { paths: redactPaths(), censor: '[REDACTED]' },
    // Bind request/job context to every log line (api, worker, bot).
    mixin() {
      const ctx = RequestContext.get();
      if (!ctx) return {};
      return {
        requestId: ctx.requestId,
        ...(ctx.userId ? { userId: ctx.userId } : {}),
        ...(ctx.adminId ? { adminId: ctx.adminId } : {}),
        ...(ctx.jobId ? { jobId: ctx.jobId, queue: ctx.queue } : {}),
      };
    },
    transport: pretty
      ? { target: 'pino-pretty', options: { singleLine: true, colorize: true, translateTime: 'SYS:HH:MM:ss.l' } }
      : undefined,
  };
}

/** nestjs-pino configuration: JSON in production, pretty in development, level from LOG_LEVEL. */
export function buildLoggerParams(opts: { level: string; pretty: boolean; http: boolean }): Params {
  return {
    pinoHttp: {
      ...basePinoOptions(opts.level, opts.pretty),
      autoLogging: opts.http ? { ignore: (req: IncomingMessage) => (req.url ?? '').includes('/health') } : false,
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const id = sanitizeRequestId(req.headers['x-request-id']);
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req: { id?: unknown; method?: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          url: (req.url ?? '').split('?')[0],
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
    },
  };
}
