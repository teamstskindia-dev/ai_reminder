import pino from 'pino';
import { RequestContext, sanitizeRequestId, withCorrelation } from '../context/request-context';
import { basePinoOptions, redactPaths, SENSITIVE_KEYS } from './logger.config';

const R = '[REDACTED]';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function makeLogger() {
  const lines: Record<string, unknown>[] = [];
  const stream = {
    write: (s: string) => void lines.push(JSON.parse(s) as Record<string, unknown>),
  };
  const logger = pino(basePinoOptions('info', false), stream);
  return { logger, lines, last: () => lines[lines.length - 1] };
}

describe('redactPaths', () => {
  it('covers request headers and every sensitive key, without duplicates', () => {
    const paths = redactPaths();
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual(expect.arrayContaining(['req.headers.authorization', 'req.headers.cookie']));
    for (const k of ['password', 'refreshToken', 'GEMINI_API_KEY']) {
      expect(paths).toEqual(expect.arrayContaining([k, `*.${k}`, `*.*.${k}`]));
    }
  });

  it('is accepted by pino', () => {
    expect(() => pino({ redact: { paths: redactPaths(), censor: R } }, { write: () => undefined })).not.toThrow();
    expect(() => makeLogger()).not.toThrow();
  });
});

describe('basePinoOptions redaction', () => {
  it('redacts authorization and cookie request headers but keeps other headers', () => {
    const { logger, last } = makeLogger();
    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer abc',
            cookie: 'remi_at=abc',
            'user-agent': 'jest',
            'x-revalidate-secret': 's',
          },
          query: { code: 'oauth-code', state: 'st', page: '2' },
        },
        res: { headers: { 'set-cookie': 'remi_rt=xyz' } },
      },
      'request',
    );
    const line = last() as {
      req: { headers: Record<string, string>; query: Record<string, string> };
      res: { headers: Record<string, string> };
    };
    expect(line.req.headers.authorization).toBe(R);
    expect(line.req.headers.cookie).toBe(R);
    expect(line.req.headers['x-revalidate-secret']).toBe(R);
    expect(line.req.headers['user-agent']).toBe('jest');
    expect(line.req.query.code).toBe(R);
    expect(line.req.query.state).toBe(R);
    expect(line.req.query.page).toBe('2');
    expect(line.res.headers['set-cookie']).toBe(R);
  });

  it('keeps error codes visible but redacts auth codes in request bodies and depth-3 secrets', () => {
    const { logger, last } = makeLogger();
    logger.info(
      {
        code: 'NOT_FOUND',
        err: { code: 'ECONNREFUSED' },
        body: { code: 'otc-123' },
        a: { b: { c: { password: 'x' } } },
      },
      'x',
    );
    const line = last();
    expect(line.code).toBe('NOT_FOUND');
    expect((line.err as Record<string, unknown>).code).toBe('ECONNREFUSED');
    expect((line.body as Record<string, unknown>).code).toBe(R);
    expect(
      (((line.a as Record<string, unknown>).b as Record<string, unknown>).c as Record<string, unknown>).password,
    ).toBe(R);
  });

  it('redacts sensitive top-level fields and keeps the rest', () => {
    const { logger, last } = makeLogger();
    const secrets = {
      password: 'p',
      passwordHash: 'h',
      token: 't',
      accessToken: 'a',
      refreshToken: 'r',
      oauthCode: 'oauth-code',
      codeVerifier: 'v',
      apiKey: 'k',
      secret: 's',
      accessTokenEnc: 'ae',
      refreshTokenEnc: 're',
      GEMINI_API_KEY: 'g',
      DATABASE_URL: 'postgresql://u:pw@h/db',
    };
    logger.info({ ...secrets, userId: 'u1', meetingId: 'm1' }, 'hello');
    const line = last();
    for (const k of Object.keys(secrets)) expect(line[k]).toBe(R);
    expect(line.userId).toBe('u1');
    expect(line.meetingId).toBe('m1');
    expect(line.msg).toBe('hello');
    expect(JSON.stringify(line)).not.toContain('postgresql://');
  });

  it('redacts one and two levels deep', () => {
    const { logger, last } = makeLogger();
    logger.info({
      body: { password: 'p', name: 'Priya' },
      a: { b: { refreshToken: 'r', keep: 'k' } },
    });
    const line = last() as {
      body: Record<string, string>;
      a: { b: Record<string, string> };
    };
    expect(line.body.password).toBe(R);
    expect(line.body.name).toBe('Priya');
    expect(line.a.b.refreshToken).toBe(R);
    expect(line.a.b.keep).toBe('k');
  });

  it('redacts every SENSITIVE_KEYS entry nested one level deep', () => {
    const { logger, last } = makeLogger();
    const nested = Object.fromEntries(SENSITIVE_KEYS.map((k) => [k, 'secret-value']));
    logger.info({ payload: nested, keep: 'ok' });
    const line = last() as { payload: Record<string, string>; keep: string };
    for (const k of SENSITIVE_KEYS) expect(line.payload[k]).toBe(R);
    expect(line.keep).toBe('ok');
  });

  it('does not mutate the logged object', () => {
    const { logger } = makeLogger();
    const obj = { password: 'p', body: { token: 't' } };
    logger.info(obj);
    expect(obj).toEqual({ password: 'p', body: { token: 't' } });
  });
});

describe('basePinoOptions mixin', () => {
  it('adds requestId (and user/job context) inside RequestContext.run', () => {
    const { logger, last } = makeLogger();
    RequestContext.run(
      {
        requestId: 'req-12345678',
        userId: 'u1',
        jobId: 'j1',
        queue: 'ai-processing',
      },
      () => {
        logger.info('inside');
      },
    );
    expect(last()).toMatchObject({
      requestId: 'req-12345678',
      userId: 'u1',
      jobId: 'j1',
      queue: 'ai-processing',
      msg: 'inside',
    });
  });

  it('picks up fields added with RequestContext.set', () => {
    const { logger, last } = makeLogger();
    RequestContext.run({ requestId: 'req-12345678' }, () => {
      RequestContext.set({ adminId: 'a1' });
      logger.info('admin');
    });
    expect(last()).toMatchObject({ requestId: 'req-12345678', adminId: 'a1' });
    expect(last()).not.toHaveProperty('userId');
  });

  it('adds nothing outside a context', () => {
    const { logger, last } = makeLogger();
    logger.info('outside');
    expect(last()).not.toHaveProperty('requestId');
  });

  it('is pretty only when asked', () => {
    expect(basePinoOptions('info', false).transport).toBeUndefined();
    expect(basePinoOptions('debug', true).transport).toMatchObject({
      target: 'pino-pretty',
    });
    expect(basePinoOptions('warn', false).level).toBe('warn');
  });
});

describe('sanitizeRequestId', () => {
  it.each(['req-12345678', 'abc.def:ghi_jk-12', 'a'.repeat(128), '3f2b8c1e-1b2a-4c3d-9e8f-0a1b2c3d4e5f'])(
    'accepts %s',
    (value) => {
      expect(sanitizeRequestId(value)).toBe(value);
    },
  );

  it.each([
    ['short'],
    ['bad id\n<script>'],
    ['a'.repeat(129)],
    ['has space here'],
    ['semi;colon1'],
    [''],
    [undefined],
    [42],
  ])('replaces %p with a UUID', (value) => {
    expect(sanitizeRequestId(value)).toMatch(UUID_RE);
  });

  it('uses the first value of an array header', () => {
    expect(sanitizeRequestId(['req-12345678', 'other-12345678'])).toBe('req-12345678');
    expect(sanitizeRequestId(['bad id'])).toMatch(UUID_RE);
  });
});

describe('withCorrelation', () => {
  it('adds the current requestId as correlationId inside a context only', () => {
    expect(withCorrelation({ meetingId: 'm1' })).toEqual({ meetingId: 'm1' });
    RequestContext.run({ requestId: 'req-12345678' }, () => {
      expect(withCorrelation({ meetingId: 'm1' })).toEqual({
        meetingId: 'm1',
        correlationId: 'req-12345678',
      });
      expect(RequestContext.requestId()).toBe('req-12345678');
    });
    expect(RequestContext.get()).toBeUndefined();
  });
});
