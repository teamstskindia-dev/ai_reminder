import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext, sanitizeRequestId } from './request-context';

/** Binds the request id (set by pino-http's genReqId, or a fresh one) to AsyncLocalStorage. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request & { id?: unknown }, res: Response, next: NextFunction): void {
    let id = typeof req.id === 'string' ? req.id : undefined;
    if (!id) {
      id = sanitizeRequestId(req.headers['x-request-id']);
      req.id = id;
      res.setHeader('X-Request-Id', id);
    }
    RequestContext.run({ requestId: id }, () => next());
  }
}
