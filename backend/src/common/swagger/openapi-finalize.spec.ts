import type { OpenAPIObject, OperationObject, ParameterObject, ResponseObject } from '@nestjs/swagger';
import { OPENAPI_EXT } from './api-docs.decorators';
import { errorCodesFor, finalizeOpenApiDocument } from './openapi-finalize';
import { lintOpenApiDocument } from './openapi-lint';

type Op = OperationObject & Record<string, unknown>;

const ok = (): Record<string, ResponseObject> => ({
  '200': { description: '', content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } } },
});

function docWith(paths: Record<string, Record<string, Op>>): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    tags: [{ name: 'things' }],
    paths,
    components: {
      schemas: {
        Thing: { type: 'object', properties: { id: { type: 'string' } } },
        ApiErrorResponse: { type: 'object', properties: { success: { type: 'boolean' } } },
      },
    },
  };
}

describe('errorCodesFor', () => {
  it('derives auth, input, rate-limit, maintenance and internal errors for a user route with a body', () => {
    const op: Op = { responses: {}, requestBody: { content: {} }, [OPENAPI_EXT.auth]: { kind: 'user' } };
    expect(errorCodesFor(op)).toEqual([
      'BAD_REQUEST',
      'VALIDATION_ERROR',
      'UNAUTHORIZED',
      'TOKEN_EXPIRED',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
      'MAINTENANCE',
    ]);
  });

  it('adds FORBIDDEN for admin routes and omits MAINTENANCE when exempt', () => {
    const op: Op = {
      responses: {},
      [OPENAPI_EXT.auth]: { kind: 'admin', minRole: 'editor' },
      [OPENAPI_EXT.maintenanceExempt]: true,
    };
    const codes = errorCodesFor(op);
    expect(codes).toContain('FORBIDDEN');
    expect(codes).not.toContain('MAINTENANCE');
  });

  it('documents only explicit + always-on errors for a public, unthrottled route without input', () => {
    const op: Op = {
      responses: {},
      [OPENAPI_EXT.errors]: ['NOT_FOUND'],
      [OPENAPI_EXT.noThrottle]: true,
      [OPENAPI_EXT.maintenanceExempt]: true,
    };
    expect(errorCodesFor(op)).toEqual(['NOT_FOUND', 'INTERNAL_ERROR']);
  });

  it('treats query parameters as validated input', () => {
    const op: Op = { responses: {}, parameters: [{ name: 'page', in: 'query' }] };
    expect(errorCodesFor(op)).toContain('VALIDATION_ERROR');
  });
});

describe('finalizeOpenApiDocument', () => {
  function finalizeOne(op: Op, path = '/api/v1/things/{id}') {
    const doc = finalizeOpenApiDocument(docWith({ [path]: { patch: op } }));
    return doc.paths[path].patch as Op;
  }

  it('groups error codes by status with one example per code', () => {
    const op = finalizeOne({
      responses: ok(),
      requestBody: { content: {} },
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      [OPENAPI_EXT.auth]: { kind: 'user' },
      [OPENAPI_EXT.errors]: ['NOT_FOUND'],
    });
    const responses = op.responses as Record<string, ResponseObject>;
    expect(Object.keys(responses)).toEqual(['200', '400', '401', '404', '429', '500', '503']);

    const examples = responses['400'].content?.['application/json'].examples ?? {};
    expect(Object.keys(examples)).toEqual(['BAD_REQUEST', 'VALIDATION_ERROR']);
    const validation = (examples.VALIDATION_ERROR as { value: { error: { details?: unknown[] } } }).value;
    expect(validation.error.details?.length).toBeGreaterThan(0);
    expect(responses['400'].content?.['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ApiErrorResponse',
    });
    expect(responses['429'].headers?.['Retry-After']).toBeDefined();
    expect(responses['200'].description).toBe('OK');
  });

  it('marks `id` path params as UUIDs, adds the admin role and strips internal extensions', () => {
    const op = finalizeOne({
      responses: ok(),
      description: 'Updates a thing.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      [OPENAPI_EXT.auth]: { kind: 'admin', minRole: 'super_admin' },
    });
    expect((op.parameters?.[0] as ParameterObject).schema).toEqual({ type: 'string', format: 'uuid' });
    expect(op.description).toBe('**Admin role:** `super_admin` or higher.\n\nUpdates a thing.');
    expect(Object.keys(op).filter((k) => k.startsWith('x-remi-'))).toEqual([]);
  });

  it('keeps an explicit response for a status instead of replacing it with the error body', () => {
    const op = finalizeOne(
      {
        responses: { ...ok(), '503': { description: 'Degraded', content: {} } },
        [OPENAPI_EXT.noThrottle]: true,
      },
      '/api/v1/things',
    );
    expect((op.responses as Record<string, ResponseObject>)['503'].description).toBe('Degraded');
  });
});

describe('lintOpenApiDocument', () => {
  const good: Op = { summary: 'Get a thing', tags: ['things'], responses: ok() };

  it('passes a complete document', () => {
    expect(lintOpenApiDocument(docWith({ '/things': { get: good } }))).toEqual([]);
  });

  it('reports missing summaries, untyped responses, undeclared tags and leftover extensions', () => {
    const problems = lintOpenApiDocument(
      docWith({
        '/a': { get: { ...good, summary: '' } },
        '/b': {
          get: {
            ...good,
            responses: { '200': { description: '', content: { 'application/json': { schema: { type: 'object' } } } } },
          },
        },
        '/c': { get: { ...good, responses: { '201': { description: 'Created' } } } },
        '/d': { get: { ...good, tags: ['nope'] } },
        '/e': { get: { ...good, [OPENAPI_EXT.auth]: { kind: 'user' } } },
      }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('GET /a: missing summary'),
        expect.stringContaining('GET /b 200: response schema is an untyped object'),
        expect.stringContaining('GET /c 201: response has no schema'),
        expect.stringContaining('GET /d: tag "nope"'),
        expect.stringContaining('GET /e: internal extension x-remi-auth'),
      ]),
    );
  });

  it('reports empty models and dangling refs', () => {
    const doc = docWith({
      '/things': {
        get: {
          ...good,
          responses: {
            '200': {
              description: '',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Gone' } } },
            },
          },
        },
      },
    });
    (doc.components!.schemas as Record<string, unknown>).EmptyDto = { type: 'object', properties: {} };
    expect(lintOpenApiDocument(doc)).toEqual(
      expect.arrayContaining(['dangling $ref #/components/schemas/Gone', expect.stringContaining('schema EmptyDto')]),
    );
  });

  it('accepts bodyless success responses (204 / 302 / 304)', () => {
    const op: Op = { ...good, responses: { '204': { description: 'Deleted' } } };
    expect(lintOpenApiDocument(docWith({ '/things': { delete: op } }))).toEqual([]);
  });
});
