import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ErrorCode } from '../types/api.types';
import type { PaginationMeta as PaginationMetaShape } from '../types/api.types';

/**
 * OpenAPI models for the response envelope and the error body (API contract §0).
 * They only describe JSON; the envelope interceptor and the exception filter produce it.
 */

export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'TOKEN_EXPIRED',
  'FORBIDDEN',
  'PLAN_LIMIT_REACHED',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'UPSTREAM_ERROR',
  'MAINTENANCE',
] as const satisfies readonly ErrorCode[];

export class PaginationMeta implements PaginationMetaShape {
  /** 1-based page number. */
  @ApiProperty({ type: 'integer', minimum: 1, example: 1 })
  page: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100, example: 20 })
  limit: number;

  /** Total number of matching items across all pages. */
  @ApiProperty({ type: 'integer', minimum: 0, example: 42 })
  total: number;

  @ApiProperty({ type: 'integer', minimum: 1, example: 3 })
  totalPages: number;
}

export class ValidationIssue {
  /** Dot path to the offending field, e.g. `title`, `value.primaryColor` or `items.2.title`. */
  @ApiProperty({ example: 'title' })
  field: string;

  @ApiProperty({ type: [String], example: ['title must be shorter than or equal to 300 characters'] })
  messages: string[];
}

export class ApiErrorInfo {
  @ApiProperty({ enum: ERROR_CODES, enumName: 'ErrorCode', example: 'NOT_FOUND' })
  code: ErrorCode;

  /** Human-readable and safe to show to end users. Never contains stack traces, SQL or provider internals. */
  @ApiProperty({ example: 'Meeting not found' })
  message: string;

  /** Present only for `VALIDATION_ERROR`. */
  @ApiPropertyOptional({ type: [ValidationIssue] })
  details?: ValidationIssue[];
}

export class ApiErrorResponse {
  @ApiProperty({ enum: [false], example: false })
  success: false;

  @ApiProperty({ type: 'integer', example: 404 })
  statusCode: number;

  @ApiProperty({ type: ApiErrorInfo })
  error: ApiErrorInfo;

  /** Request path without the query string. */
  @ApiProperty({ example: '/api/v1/meetings/0b6f6c1e-8a43-4c55-9a31-1f8f0c1f5d2a' })
  path: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-03T10:00:00.000Z' })
  timestamp: string;

  /** Also returned as the `X-Request-Id` header. Show it as a "Reference" on 5xx errors. */
  @ApiProperty({ example: '6f1d2c0a-3b9e-4f57-8c1a-2d7e9b4a5c10' })
  requestId: string;
}
