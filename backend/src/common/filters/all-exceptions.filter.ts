import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { sanitizeRequestId } from '../context/request-context';
import { causeChain } from '../errors/app.exception';
import { clientMessage, toAppException } from '../errors/error-mapper';
import type { AppRequest } from '../http/request.types';

export interface ApiErrorBody {
  success: false;
  statusCode: number;
  error: { code: string; message: string; details?: { field: string; messages: string[] }[] };
  path: string;
  timestamp: string;
  requestId: string;
}

const logger = new Logger('HttpError');

/** Builds the contract `ApiError` body + headers for any thrown value (pure; unit-tested). */
export function buildErrorResponse(
  error: unknown,
  req: Pick<AppRequest, 'originalUrl' | 'url' | 'headers'> & { id?: unknown },
): {
  status: number;
  body: ApiErrorBody;
  headers: Record<string, string>;
  exception: ReturnType<typeof toAppException>;
} {
  const exception = toAppException(error);
  const status = exception.getStatus();
  const requestId = typeof req.id === 'string' && req.id ? req.id : sanitizeRequestId(req.headers['x-request-id']);
  const body: ApiErrorBody = {
    success: false,
    statusCode: status,
    error: {
      code: exception.code,
      message: clientMessage(exception),
      ...(exception.code === 'VALIDATION_ERROR' && exception.details ? { details: exception.details } : {}),
    },
    path: (req.originalUrl ?? req.url ?? '').split('?')[0],
    timestamp: new Date().toISOString(),
    requestId,
  };
  return { status, body, headers: { ...exception.headers, 'X-Request-Id': requestId }, exception };
}

/** Sends the error response and logs it at the right level (5xx error with cause chain, 401/404 debug, other 4xx warn). */
export function sendError(error: unknown, req: AppRequest, res: Response): void {
  const { status, body, headers, exception } = buildErrorResponse(error, req);
  const route = (req.route as { path?: string } | undefined)?.path ?? body.path;
  const fields = {
    requestId: body.requestId,
    method: req.method,
    route,
    status,
    code: body.error.code,
    userId: req.user?.id,
    adminId: req.admin?.id,
  };
  if (status >= 500) {
    const cause = (exception as { cause?: unknown }).cause ?? error;
    logger.error(
      { ...fields, err: cause instanceof Error ? cause : undefined, causes: causeChain(cause) },
      exception.message,
    );
  } else if (status === 401 || status === 404) {
    logger.debug(fields, body.error.message);
  } else {
    logger.warn(fields, body.error.message);
  }
  if (res.headersSent) return;
  res.status(status).set(headers).json(body);
}

/** Global filter: every error leaving a controller becomes an `ApiError`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const ctx = host.switchToHttp();
    sendError(error, ctx.getRequest<AppRequest>(), ctx.getResponse<Response>());
  }
}

/** Express error middleware for errors raised before Nest routing (body parser limits, malformed JSON). */
export function expressErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  sendError(err, req as AppRequest, res);
}
