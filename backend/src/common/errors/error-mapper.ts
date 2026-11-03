import { HttpException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ZodError } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import type { ErrorCode } from '../types/api.types';
import {
  AppException,
  ConflictError,
  ERROR_STATUS,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ValidationIssue,
} from './app.exception';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'BAD_REQUEST',
  406: 'BAD_REQUEST',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  502: 'UPSTREAM_ERROR',
};

/** zod issues → `{ field, messages }[]` with paths prefixed (settings use `value.`). */
export function zodIssues(error: ZodError, prefix = 'value'): ValidationIssue[] {
  const byField = new Map<string, string[]>();
  for (const issue of error.issues) {
    const field = [prefix, ...issue.path.map(String)].filter(Boolean).join('.');
    byField.set(field, [...(byField.get(field) ?? []), issue.message]);
  }
  return [...byField.entries()].map(([field, messages]) => ({ field, messages }));
}

function uniqueFields(err: Prisma.PrismaClientKnownRequestError): string[] {
  const meta: Record<string, unknown> = err.meta ?? {};
  const target = meta.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  const adapter = meta.driverAdapterError as
    { cause?: { constraint?: { fields?: unknown; index?: unknown } } } | undefined;
  const constraint = adapter?.cause?.constraint;
  if (Array.isArray(constraint?.fields)) return constraint.fields.map(String);
  if (typeof constraint?.index === 'string') return [constraint.index];
  return [];
}

export function mapPrismaKnownError(err: Prisma.PrismaClientKnownRequestError): AppException {
  switch (err.code) {
    case 'P2002': {
      const fields = uniqueFields(err).map((f) => f.replace(/"/g, ''));
      const what = fields.length ? ` (${fields.join(', ')})` : '';
      return new ConflictError(`A record with the same value already exists${what}`, err);
    }
    case 'P2025':
    case 'P2001':
    case 'P2018':
      return new NotFoundError('Record');
    case 'P2003':
    case 'P2014':
      return new ConflictError('This change conflicts with related records', err);
    case 'P2000':
      return new ValidationError([{ field: 'value', messages: ['Value is too long'] }]);
    case 'P2023':
    case 'P2007':
      return new AppException('BAD_REQUEST', 'Invalid identifier or value', 400, undefined, err);
    default:
      return new InternalError(undefined, err);
  }
}

interface BodyParserError {
  type?: string;
  status?: number;
  statusCode?: number;
}

/**
 * Normalises any thrown value into an AppException whose message is safe for clients.
 * Internal details are kept as `cause` for logging only.
 */
export function toAppException(error: unknown): AppException {
  if (error instanceof AppException) return error;

  if (error instanceof ZodError) return new ValidationError(zodIssues(error));

  if (error instanceof Prisma.PrismaClientKnownRequestError) return mapPrismaKnownError(error);
  if (
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return new InternalError(undefined, error);
  }

  if (error instanceof ThrottlerException) {
    return new AppException('RATE_LIMITED', 'Too many requests, please slow down', 429);
  }

  if (error instanceof HttpException) {
    const status = error.getStatus();
    const code = STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
    // Only AppException.maintenance() means MAINTENANCE; any other 5xx is an internal error.
    if (status >= 500) return new InternalError(undefined, error);
    const res = error.getResponse();
    let message = error.message;
    if (typeof res === 'object' && res && 'message' in res) {
      const m: unknown = res.message;
      message = Array.isArray(m) ? m.map(String).join('; ') : String(m);
    }
    if (status === 413) message = 'File or request body too large';
    if (status === 415) message = 'Unsupported file type';
    return new AppException(code, message.slice(0, 300), status, undefined, error);
  }

  if (error instanceof Error) {
    if (error.name === 'TokenExpiredError') return AppException.tokenExpired();
    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError')
      return new UnauthorizedError('Invalid access token');
    if (error.name === 'MulterError') {
      const code = (error as Error & { code?: string }).code;
      if (code === 'LIMIT_FILE_SIZE') return AppException.payloadTooLarge('File too large');
      return new AppException('BAD_REQUEST', 'Invalid file upload', 400, undefined, error);
    }
    const bp = error as Error & BodyParserError;
    if (bp.type === 'entity.too.large') return AppException.payloadTooLarge('Request body too large');
    if (bp.type === 'entity.parse.failed') return AppException.badRequest('Malformed JSON body');
    if (bp.type === 'encoding.unsupported' || bp.type === 'charset.unsupported') {
      return AppException.unsupportedMedia('Unsupported request encoding');
    }
    const status = bp.status ?? bp.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return new AppException(STATUS_TO_CODE[status] ?? 'BAD_REQUEST', 'Bad request', status, undefined, error);
    }
  }

  return new InternalError(undefined, error);
}

/** Message returned to clients for a given exception (5xx never expose internals). */
export function clientMessage(ex: AppException): string {
  const status = ex.getStatus();
  if (ex.code === 'INTERNAL_ERROR' || (status >= 500 && ex.code !== 'UPSTREAM_ERROR' && ex.code !== 'MAINTENANCE')) {
    return 'Something went wrong. Please try again later.';
  }
  return ex.message;
}

export { ERROR_STATUS };
