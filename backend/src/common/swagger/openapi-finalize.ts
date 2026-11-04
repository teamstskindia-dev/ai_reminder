import type {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  PathItemObject,
  ReferenceObject,
  ResponseObject,
} from '@nestjs/swagger';
import { ERROR_STATUS } from '../errors/app.exception';
import type { AdminRole, ErrorCode } from '../types/api.types';
import { OPENAPI_EXT } from './api-docs.decorators';
import { ERROR_CODES } from './api-models.dto';

/** Compile-time guard: ERROR_CODES must list every contract error code. */
type MissingErrorCodes = Exclude<ErrorCode, (typeof ERROR_CODES)[number]>;
const ALL_CODES_LISTED: [MissingErrorCodes] extends [never] ? true : never = true;
void ALL_CODES_LISTED;

/** When each error happens, plus an example message, shown in every operation's error responses. */
export const ERROR_DOCS: Record<ErrorCode, { when: string; example: string }> = {
  BAD_REQUEST: {
    when: 'Malformed JSON body, invalid file upload or an invalid id in the path.',
    example: 'Validation failed (uuid is expected)',
  },
  VALIDATION_ERROR: {
    when: 'One or more fields failed validation. `error.details` lists every field and message.',
    example: 'Validation failed',
  },
  UNAUTHORIZED: { when: 'Missing or invalid credentials.', example: 'Authentication required' },
  TOKEN_EXPIRED: { when: 'The access token expired. Refresh it and retry.', example: 'Access token expired' },
  FORBIDDEN: {
    when: 'Signed in but not allowed: role too low, account suspended, or the feature is disabled.',
    example: 'You do not have permission to do this',
  },
  PLAN_LIMIT_REACHED: {
    when: 'A limit of the user plan was reached.',
    example: 'You have reached the meeting limit of your plan',
  },
  NOT_FOUND: {
    when: 'The resource does not exist or belongs to someone else (never 403, so ids cannot be probed).',
    example: 'Resource not found',
  },
  CONFLICT: {
    when: 'The request conflicts with the current state.',
    example: 'A record with the same value already exists',
  },
  PAYLOAD_TOO_LARGE: { when: 'The file or request body is over the size limit.', example: 'File too large' },
  UNSUPPORTED_MEDIA_TYPE: { when: 'The file type is not accepted.', example: 'Unsupported file type' },
  RATE_LIMITED: {
    when: 'Too many requests. Wait for the number of seconds in `Retry-After`.',
    example: 'Too many requests, please slow down',
  },
  INTERNAL_ERROR: {
    when: 'Unexpected server error. Show `requestId` to the user as a support reference.',
    example: 'Something went wrong. Please try again later.',
  },
  UPSTREAM_ERROR: {
    when: 'A dependency (Google, Gemini, Cloudinary, Expo, SMTP, Storage) failed. Safe to retry.',
    example: 'The AI service is unavailable right now. Please try again.',
  },
  MAINTENANCE: { when: 'The app is in maintenance mode.', example: 'We are down for maintenance.' },
};

const SUCCESS_TEXT: Record<string, string> = {
  '200': 'OK',
  '201': 'Created',
  '202': 'Accepted',
  '204': 'No content',
  '302': 'Redirect',
  '304': 'Not modified',
};

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'] as const;

type AuthExt = { kind: 'user' } | { kind: 'admin'; minRole: AdminRole };
type Ext = Record<string, unknown>;

function isParam(p: ParameterObject | ReferenceObject): p is ParameterObject {
  return !('$ref' in p);
}

function errorExample(code: ErrorCode, path: string) {
  const status = ERROR_STATUS[code];
  return {
    success: false,
    statusCode: status,
    error: {
      code,
      message: ERROR_DOCS[code].example,
      ...(code === 'VALIDATION_ERROR'
        ? { details: [{ field: 'title', messages: ['title must be shorter than or equal to 300 characters'] }] }
        : {}),
    },
    path,
    timestamp: '2026-11-03T10:00:00.000Z',
    requestId: '6f1d2c0a-3b9e-4f57-8c1a-2d7e9b4a5c10',
  };
}

function errorResponse(codes: ErrorCode[], path: string): ResponseObject {
  return {
    description: codes.map((c) => `- \`${c}\`: ${ERROR_DOCS[c].when}`).join('\n'),
    ...(codes.includes('RATE_LIMITED')
      ? {
          headers: {
            'Retry-After': { description: 'Seconds to wait before retrying.', schema: { type: 'integer' } },
          },
        }
      : {}),
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiErrorResponse' },
        examples: Object.fromEntries(
          codes.map((c) => [c, { summary: ERROR_DOCS[c].when, value: errorExample(c, path) }]),
        ),
      },
    },
  };
}

/** The error codes an operation can return: explicit ones plus those implied by auth, input and guards. */
export function errorCodesFor(op: OperationObject & Ext): ErrorCode[] {
  const codes = new Set<ErrorCode>((op[OPENAPI_EXT.errors] as ErrorCode[] | undefined) ?? []);
  const auth = op[OPENAPI_EXT.auth] as AuthExt | undefined;
  const params = (op.parameters ?? []).filter(isParam);

  if (op.requestBody) codes.add('VALIDATION_ERROR').add('BAD_REQUEST');
  if (params.some((p) => p.in === 'query')) codes.add('VALIDATION_ERROR');
  if (params.some((p) => p.in === 'path' && (p.schema as { format?: string } | undefined)?.format === 'uuid')) {
    codes.add('BAD_REQUEST');
  }
  if (auth) codes.add('UNAUTHORIZED').add('TOKEN_EXPIRED');
  if (auth?.kind === 'admin') codes.add('FORBIDDEN');
  if (!op[OPENAPI_EXT.noThrottle]) codes.add('RATE_LIMITED');
  if (!op[OPENAPI_EXT.maintenanceExempt]) codes.add('MAINTENANCE');
  codes.add('INTERNAL_ERROR');

  // Stable, contract order.
  return ERROR_CODES.filter((c) => codes.has(c));
}

function finalizeOperation(op: OperationObject & Ext, path: string): void {
  // Convention (API contract): every `:id` path parameter is a UUID, validated by ParseUUIDPipe.
  for (const p of (op.parameters ?? []).filter(isParam)) {
    if (p.in === 'path' && p.name === 'id') {
      p.schema = { type: 'string', format: 'uuid' };
      p.description ??= 'Resource id (UUID).';
    }
  }

  const auth = op[OPENAPI_EXT.auth] as AuthExt | undefined;
  if (auth?.kind === 'admin') {
    const role = `**Admin role:** \`${auth.minRole}\` or higher.`;
    op.description = op.description ? `${role}\n\n${op.description}` : role;
  }

  const responses = (op.responses ??= {}) as Record<string, ResponseObject | ReferenceObject>;
  for (const [status, res] of Object.entries(responses)) {
    if (!('$ref' in res) && !res.description) res.description = SUCCESS_TEXT[status] ?? 'OK';
  }

  const byStatus = new Map<number, ErrorCode[]>();
  for (const code of errorCodesFor(op)) {
    const status = ERROR_STATUS[code];
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  for (const [status, codes] of byStatus) {
    // An explicit response for this status (e.g. health's raw 503) wins.
    if (!responses[String(status)]) responses[String(status)] = errorResponse(codes, path);
  }
  op.responses = Object.fromEntries(Object.entries(responses).sort(([a], [b]) => Number(a) - Number(b)));

  for (const key of Object.values(OPENAPI_EXT)) delete op[key];
}

/**
 * Post-processes the generated document: documents every operation's error responses (grouped by status,
 * with one example per error code), marks `id` path params as UUIDs, adds the admin role requirement to
 * the description, fills empty success descriptions and strips the internal `x-remi-*` extensions.
 */
export function finalizeOpenApiDocument(doc: OpenAPIObject): OpenAPIObject {
  for (const [path, item] of Object.entries<PathItemObject>(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const op = item[method] as (OperationObject & Ext) | undefined;
      if (op) finalizeOperation(op, path.replace(/\{(\w+)\}/g, ':$1'));
    }
  }
  return doc;
}
