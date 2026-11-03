// The generated Prisma client uses `.js` import specifiers that Jest cannot resolve without a
// moduleNameMapper, so expose the real runtime error classes under the same `Prisma` namespace.
jest.mock('../../generated/prisma/client', () => {
  const runtime = jest.requireActual<typeof import('@prisma/client/runtime/client')>('@prisma/client/runtime/client');
  return {
    Prisma: {
      PrismaClientKnownRequestError: runtime.PrismaClientKnownRequestError,
      PrismaClientValidationError: runtime.PrismaClientValidationError,
      PrismaClientUnknownRequestError: runtime.PrismaClientUnknownRequestError,
      PrismaClientInitializationError: runtime.PrismaClientInitializationError,
      PrismaClientRustPanicError: runtime.PrismaClientRustPanicError,
    },
  };
});

import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import * as runtime from '@prisma/client/runtime/client';
import { ThrottlerException } from '@nestjs/throttler';
import { z } from 'zod';
import { AppException, UpstreamError } from '../errors/app.exception';
import type { AppRequest } from '../http/request.types';
import { buildErrorResponse, expressErrorHandler, sendError } from './all-exceptions.filter';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GENERIC = 'Something went wrong. Please try again later.';

type Req = Parameters<typeof buildErrorResponse>[1];
const req = (over: Partial<Req> = {}): Req => ({
  originalUrl: '/api/v1/meetings?q=secret',
  url: '/meetings?q=secret',
  headers: {},
  ...over,
});

const known = (code: string, meta?: Record<string, unknown>) =>
  new runtime.PrismaClientKnownRequestError(`Invalid query (${code})`, {
    code,
    clientVersion: '7.10.1',
    meta,
  });

function build(error: unknown, r: Req = req()) {
  return buildErrorResponse(error, r);
}

beforeAll(() => {
  Logger.overrideLogger(false);
});

describe('buildErrorResponse', () => {
  it('produces the ApiError envelope', () => {
    const { status, body, headers } = build(AppException.notFound('Meeting'), req({ id: 'req-abcdefgh' }));
    expect(status).toBe(404);
    expect(body).toEqual({
      success: false,
      statusCode: 404,
      error: { code: 'NOT_FOUND', message: 'Meeting not found' },
      path: '/api/v1/meetings',
      timestamp: expect.any(String) as unknown,
      requestId: 'req-abcdefgh',
    });
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    expect(headers['X-Request-Id']).toBe('req-abcdefgh');
  });

  describe('validation', () => {
    it('class-validator style AppException.validation → 400 VALIDATION_ERROR with details', () => {
      const details = [{ field: 'title', messages: ['title should not be empty'] }];
      const { status, body } = build(AppException.validation(details));
      expect(status).toBe(400);
      expect(body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details,
      });
    });

    it('ZodError → VALIDATION_ERROR with value.* field paths', () => {
      const error = z.object({ a: z.string(), n: z.object({ b: z.number() }) }).safeParse({ n: {} }).error;
      const { status, body } = build(error);
      expect(status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details?.map((d) => d.field).sort()).toEqual(['value.a', 'value.n.b']);
      for (const d of body.error.details ?? []) expect(d.messages.length).toBeGreaterThan(0);
    });

    it('only includes details for VALIDATION_ERROR', () => {
      const { body } = build(new AppException('CONFLICT', 'nope', 409, [{ field: 'a', messages: ['b'] }]));
      expect(body.error).toEqual({ code: 'CONFLICT', message: 'nope' });
      expect('details' in body.error).toBe(false);
    });
  });

  describe('Prisma errors', () => {
    it('P2002 → 409 CONFLICT naming the unique field', () => {
      const { status, body } = build(known('P2002', { target: ['email'] }));
      expect(status).toBe(409);
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toContain('email');
      expect(body.error.message).not.toContain('Invalid query');
    });

    it('P2002 with a string target or a driver-adapter constraint', () => {
      expect(build(known('P2002', { target: 'users_email_key' })).body.error.message).toContain('users_email_key');
      const adapter = {
        driverAdapterError: { cause: { constraint: { fields: ['"slug"'] } } },
      };
      expect(build(known('P2002', adapter)).body.error.message).toContain('(slug)');
      const index = {
        driverAdapterError: {
          cause: { constraint: { index: 'plans_single_default' } },
        },
      };
      expect(build(known('P2002', index)).body.error.message).toContain('plans_single_default');
      expect(build(known('P2002')).body.error.message).toBe('A record with the same value already exists');
    });

    it('P2025 → 404 NOT_FOUND', () => {
      const { status, body } = build(known('P2025'));
      expect(status).toBe(404);
      expect(body.error).toEqual({
        code: 'NOT_FOUND',
        message: 'Record not found',
      });
    });

    it('P2003 → 409 CONFLICT', () => {
      const { status, body } = build(known('P2003', { field_name: 'meeting_id' }));
      expect(status).toBe(409);
      expect(body.error.code).toBe('CONFLICT');
    });

    it('P2000 → VALIDATION_ERROR, P2023 → 400 BAD_REQUEST', () => {
      expect(build(known('P2000')).body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ field: 'value', messages: ['Value is too long'] }],
      });
      const bad = build(known('P2023'));
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('BAD_REQUEST');
    });

    it('unknown Prisma codes → 500 with a generic message', () => {
      const { status, body } = build(known('P9999'));
      expect(status).toBe(500);
      expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: GENERIC });
    });

    it('PrismaClientValidationError → 500 INTERNAL_ERROR without leaking the query', () => {
      const err = new runtime.PrismaClientValidationError('Argument `where` of type UserWhereUniqueInput needs', {
        clientVersion: '7.10.1',
      });
      const { status, body } = build(err);
      expect(status).toBe(500);
      expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: GENERIC });
      expect(JSON.stringify(body)).not.toContain('UserWhereUniqueInput');
    });

    it('PrismaClientUnknownRequestError → 500', () => {
      const err = new runtime.PrismaClientUnknownRequestError('boom', {
        clientVersion: '7.10.1',
      });
      expect(build(err).status).toBe(500);
    });
  });

  describe('unknown / internal errors', () => {
    it('plain Error → 500 INTERNAL_ERROR with a generic message that hides the original', () => {
      const { status, body } = build(new Error('SELECT * FROM secret_table'));
      expect(status).toBe(500);
      expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: GENERIC });
      expect(JSON.stringify(body)).not.toContain('secret_table');
    });

    it('AppException.internal never exposes its message', () => {
      expect(build(AppException.internal('pool exhausted at db-1')).body.error.message).toBe(GENERIC);
    });

    it('Nest 5xx exceptions hide their message', () => {
      const { status, body } = build(new InternalServerErrorException('password=hunter2'));
      expect(status).toBe(500);
      expect(JSON.stringify(body)).not.toContain('hunter2');
    });

    it.each([['boom'], [null], [undefined], [42], [{ weird: true }]])('non-Error thrown value %p → 500', (value) => {
      const { status, body } = build(value);
      expect(status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('rate limiting', () => {
    it('ThrottlerException → 429 RATE_LIMITED', () => {
      const { status, body } = build(new ThrottlerException());
      expect(status).toBe(429);
      expect(body.error.code).toBe('RATE_LIMITED');
    });

    it('RateLimitedError carries a Retry-After header (rounded up, min 1)', () => {
      expect(build(AppException.rateLimited('Too many', 899.2)).headers['Retry-After']).toBe('900');
      expect(build(AppException.rateLimited('Too many', 0)).headers['Retry-After']).toBe('1');
      const { status, body } = build(AppException.rateLimited('Too many attempts', 60));
      expect(status).toBe(429);
      expect(body.error).toEqual({
        code: 'RATE_LIMITED',
        message: 'Too many attempts',
      });
    });
  });

  describe('upload / body parser errors', () => {
    it('MulterError LIMIT_FILE_SIZE → 413', () => {
      const err = Object.assign(new Error('File too large'), {
        name: 'MulterError',
        code: 'LIMIT_FILE_SIZE',
      });
      const { status, body } = build(err);
      expect(status).toBe(413);
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('other MulterError codes → 400', () => {
      const err = Object.assign(new Error('Unexpected field'), {
        name: 'MulterError',
        code: 'LIMIT_UNEXPECTED_FILE',
      });
      expect(build(err).status).toBe(400);
    });

    it('body-parser entity.too.large → 413, entity.parse.failed → 400, encoding.unsupported → 415', () => {
      const tooLarge = Object.assign(new Error('request entity too large'), {
        type: 'entity.too.large',
        status: 413,
      });
      expect(build(tooLarge).status).toBe(413);
      expect(build(tooLarge).body.error.code).toBe('PAYLOAD_TOO_LARGE');
      const parse = Object.assign(new Error('Unexpected token } in JSON'), {
        type: 'entity.parse.failed',
        status: 400,
      });
      expect(build(parse).status).toBe(400);
      expect(build(parse).body.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Malformed JSON body',
      });
      const enc = Object.assign(new Error('unsupported content encoding'), {
        type: 'encoding.unsupported',
        status: 415,
      });
      expect(build(enc).status).toBe(415);
      expect(build(enc).body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('generic errors carrying a 4xx status keep the status with a safe message', () => {
      const err = Object.assign(new Error('internal detail'), { status: 404 });
      const { status, body } = build(err);
      expect(status).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).not.toContain('internal detail');
    });
  });

  describe('Nest HttpExceptions', () => {
    it('NotFoundException → 404 NOT_FOUND', () => {
      const { status, body } = build(new NotFoundException('Cannot GET /x'));
      expect(status).toBe(404);
      expect(body.error).toEqual({
        code: 'NOT_FOUND',
        message: 'Cannot GET /x',
      });
    });

    it('UnsupportedMediaTypeException → 415', () => {
      const { status, body } = build(new UnsupportedMediaTypeException());
      expect(status).toBe(415);
      expect(body.error).toEqual({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Unsupported file type',
      });
    });

    it('BadRequestException with a message array joins the messages', () => {
      const { status, body } = build(new BadRequestException(['a is required', 'b must be a number']));
      expect(status).toBe(400);
      expect(body.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'a is required; b must be a number',
      });
    });

    it('unmapped 4xx statuses fall back to BAD_REQUEST, long messages are truncated', () => {
      const { status, body } = build(new HttpException('x'.repeat(500), 418));
      expect(status).toBe(418);
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message.length).toBeLessThanOrEqual(300);
    });
  });

  describe('domain errors', () => {
    it('UpstreamError(gemini) → 502 UPSTREAM_ERROR with a safe message', () => {
      const err = AppException.upstream('gemini', new Error('quota exceeded for key AIzaSyFAKE'));
      expect(err).toBeInstanceOf(UpstreamError);
      const { status, body } = build(err);
      expect(status).toBe(502);
      expect(body.error).toEqual({
        code: 'UPSTREAM_ERROR',
        message: 'The AI service is unavailable right now. Please try again.',
      });
      expect(JSON.stringify(body)).not.toContain('AIza');
    });

    it('TokenExpiredError-named errors → 401 TOKEN_EXPIRED; JsonWebTokenError → 401 UNAUTHORIZED', () => {
      const expired = build(Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }));
      expect(expired.status).toBe(401);
      expect(expired.body.error.code).toBe('TOKEN_EXPIRED');
      const invalid = build(
        Object.assign(new Error('invalid signature'), {
          name: 'JsonWebTokenError',
        }),
      );
      expect(invalid.status).toBe(401);
      expect(invalid.body.error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Invalid access token',
      });
    });

    it('plan limit, forbidden and maintenance keep their messages', () => {
      expect(build(AppException.planLimit('Upgrade to ask more')).body.error).toEqual({
        code: 'PLAN_LIMIT_REACHED',
        message: 'Upgrade to ask more',
      });
      expect(build(AppException.planLimit('x')).status).toBe(403);
      expect(build(AppException.forbidden()).status).toBe(403);
      const m = build(AppException.maintenance('Back soon'));
      expect(m.status).toBe(503);
      expect(m.body.error).toEqual({
        code: 'MAINTENANCE',
        message: 'Back soon',
      });
    });
  });

  describe('requestId and path', () => {
    it('uses req.id when set', () => {
      const r = req({
        id: 'pino-req-1234',
        headers: { 'x-request-id': 'client-req-12345' },
      });
      expect(build(new Error('x'), r).body.requestId).toBe('pino-req-1234');
    });

    it('echoes a sane incoming X-Request-Id header', () => {
      const { body, headers } = build(new Error('x'), req({ headers: { 'x-request-id': 'client-req-12345' } }));
      expect(body.requestId).toBe('client-req-12345');
      expect(headers['X-Request-Id']).toBe('client-req-12345');
    });

    it('takes the first value of a repeated header', () => {
      expect(
        build(
          new Error('x'),
          req({
            headers: { 'x-request-id': ['client-req-12345', 'other-id-999'] },
          }),
        ).body.requestId,
      ).toBe('client-req-12345');
    });

    it.each(['bad id\n<script>', 'short', 'x'.repeat(200), ''])('replaces an insane header %p with a UUID', (value) => {
      const { body } = build(new Error('x'), req({ headers: { 'x-request-id': value } }));
      expect(body.requestId).toMatch(UUID_RE);
    });

    it('generates a UUID when nothing is supplied', () => {
      expect(build(new Error('x')).body.requestId).toMatch(UUID_RE);
    });

    it('path excludes the query string and falls back to req.url', () => {
      expect(build(new Error('x')).body.path).toBe('/api/v1/meetings');
      expect(build(new Error('x'), req({ originalUrl: undefined as unknown as string })).body.path).toBe('/meetings');
    });
  });

  it('never includes a stack in the body', () => {
    const errors: unknown[] = [
      new Error('boom'),
      known('P2002', { target: ['email'] }),
      AppException.validation([{ field: 'a', messages: ['b'] }]),
      new NotFoundException(),
      AppException.upstream('google', new Error('inner')),
      new ThrottlerException(),
    ];
    for (const e of errors) {
      const json = JSON.stringify(build(e).body);
      expect(json).not.toContain('stack');
      expect(json).not.toContain('    at ');
    }
  });
});

describe('sendError / expressErrorHandler', () => {
  const fakeRes = (headersSent = false) => {
    const res = {
      headersSent,
      statusCode: 0,
      headers: {} as Record<string, string>,
      payload: undefined as unknown,
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      set(h: Record<string, string>) {
        Object.assign(res.headers, h);
        return res;
      },
      json(b: unknown) {
        res.payload = b;
        return res;
      },
    };
    return res;
  };
  const appReq = {
    originalUrl: '/api/v1/x',
    url: '/x',
    headers: {},
    method: 'GET',
  } as unknown as AppRequest;

  it('writes status, headers and body', () => {
    const res = fakeRes();
    sendError(AppException.rateLimited('slow down', 30), appReq, res as never);
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('30');
    expect(res.headers['X-Request-Id']).toMatch(UUID_RE);
    expect((res.payload as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
  });

  it('does not write when headers were already sent', () => {
    const res = fakeRes(true);
    sendError(new Error('late'), appReq, res as never);
    expect(res.statusCode).toBe(0);
    expect(res.payload).toBeUndefined();
  });

  it('expressErrorHandler delegates to next() after headers are sent, otherwise responds', () => {
    const next = jest.fn();
    const sent = fakeRes(true);
    const err = Object.assign(new Error('bad json'), {
      type: 'entity.parse.failed',
    });
    expressErrorHandler(err, appReq, sent as never, next);
    expect(next).toHaveBeenCalledWith(err);
    const res = fakeRes();
    expressErrorHandler(err, appReq, res as never, next);
    expect(res.statusCode).toBe(400);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
