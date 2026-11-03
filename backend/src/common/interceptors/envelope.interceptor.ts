import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { map, Observable } from 'rxjs';
import { SKIP_ENVELOPE } from '../decorators/metadata.decorators';
import { Paginated } from '../pagination/pagination';

/** Wraps successful responses into the contract `ApiSuccess<T>` envelope. */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE, [context.getHandler(), context.getClass()]);
    if (skip) return next.handle();
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data: unknown) => {
        if (res.statusCode === 204 || res.statusCode === 304 || (res.statusCode >= 300 && res.statusCode < 400)) {
          return undefined;
        }
        if (data instanceof Paginated) {
          return { success: true, data: data.items, meta: data.meta };
        }
        return { success: true, data: data === undefined ? null : data };
      }),
    );
  }
}
