import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtension, ApiExtraModels, ApiProperty, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import type { ErrorCode } from '../types/api.types';
import { PaginationMeta } from './api-models.dto';

/**
 * Vendor extensions written by these decorators and consumed (then removed) by `finalizeOpenApiDocument`.
 * Class-level `ApiExtension` is copied onto every route method, and a method-level value wins.
 */
export const OPENAPI_EXT = {
  /** `{ kind: 'user' }` or `{ kind: 'admin', minRole }`, from `@UserAuth()` / `@AdminAuth()`. */
  auth: 'x-remi-auth',
  /** Extra error codes the handler can return, from `@ApiErrors()`. */
  errors: 'x-remi-errors',
  /** Route keeps working in maintenance mode, from `@MaintenanceExempt()`. */
  maintenanceExempt: 'x-remi-maintenance-exempt',
  /** Route is not rate limited (`@SkipThrottle()`). */
  noThrottle: 'x-remi-no-throttle',
} as const;

export interface DataResponseOptions {
  /** 200 by default; use 201 for POST routes that create a resource. */
  status?: 200 | 201;
  description?: string;
  /** `data` is an array of the model. */
  isArray?: boolean;
}

function envelopeSchema(data: object, paginated: boolean) {
  return {
    type: 'object',
    required: ['success', 'data', ...(paginated ? ['meta'] : [])],
    properties: {
      success: { type: 'boolean', enum: [true] },
      data,
      ...(paginated ? { meta: { $ref: getSchemaPath(PaginationMeta) } } : {}),
    },
  };
}

/**
 * Documents a success response wrapped in the `{ success: true, data }` envelope.
 *
 * The name must keep the `Api…Response` shape: the Swagger CLI plugin only skips its own
 * auto-generated (untyped) success response when it sees a decorator named like that.
 */
export function ApiDataResponse(model: Type<unknown>, options: DataResponseOptions = {}) {
  const status = options.status ?? 200;
  const ref = { $ref: getSchemaPath(model) };
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      description: options.description ?? (status === 201 ? 'Created' : 'OK'),
      schema: envelopeSchema(options.isArray ? { type: 'array', items: ref } : ref, false),
    }),
  );
}

/** Documents a paginated list: `{ success: true, data: Model[], meta: PaginationMeta }`. */
export function ApiPaginatedResponse(model: Type<unknown>, description = 'One page of results') {
  return applyDecorators(
    ApiExtraModels(model, PaginationMeta),
    ApiResponse({
      status: 200,
      description,
      schema: envelopeSchema({ type: 'array', items: { $ref: getSchemaPath(model) } }, true),
    }),
  );
}

// ---- property helpers (the CLI plugin still infers `required` and `nullable` from the TS type) ----

/** ISO-8601 UTC timestamp. */
export const ApiDateTime = (description?: string) =>
  ApiProperty({ type: String, format: 'date-time', example: '2026-11-03T10:00:00.000Z', description });

export const ApiUuid = (description?: string) => ApiProperty({ type: String, format: 'uuid', description });

/** OpenAPI `integer` (the plugin documents every TS `number` as `number`). */
export const ApiInteger = (options: { minimum?: number; maximum?: number; description?: string } = {}) =>
  ApiProperty({ type: 'integer', ...options });

/**
 * Error codes this route can return on top of the ones derived automatically
 * (auth → 401/403, input → 400, rate limit → 429, maintenance → 503, always 500).
 * Use it once per handler; list every extra code in that one call.
 */
export function ApiErrors(...codes: ErrorCode[]): MethodDecorator {
  return ApiExtension(OPENAPI_EXT.errors, [...new Set(codes)]);
}
