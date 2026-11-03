import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { clientContext } from '../../common/http/request.types';
import type { AppRequest } from '../../common/http/request.types';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';

export const AUDIT_META = 'remi:audit';

export interface AuditMeta {
  action: string;
  entity: string;
}

/** Marks an admin mutation for the audit log, e.g. @Audited('settings.update', 'app_settings'). */
export const Audited = (action: string, entity: string) =>
  SetMetadata(AUDIT_META, { action, entity } satisfies AuditMeta);

const SECRET_FIELDS = /pass(word)?|secret|token|hash/i;

/** Request body as stored in `audit_logs.changes`: secrets removed, long strings summarised. */
export function auditChanges(body: unknown, depth = 0): unknown {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') return body.length > 1000 ? `[${body.length} chars]` : body;
  if (typeof body !== 'object') return body;
  if (depth > 4) return '[…]';
  if (Array.isArray(body)) return body.slice(0, 100).map((v) => auditChanges(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = SECRET_FIELDS.test(k) ? '[REDACTED]' : auditChanges(v, depth + 1);
  }
  return out;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: {
    adminId: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    changes: unknown;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          ...entry,
          changes:
            entry.changes === null || entry.changes === undefined
              ? Prisma.DbNull
              : (entry.changes as Prisma.InputJsonValue),
        },
      });
    } catch (err) {
      this.logger.error({ action: entry.action, errName: (err as Error).name }, 'audit log write failed');
    }
  }
}

/** Writes one audit_logs row after every successful @Audited admin mutation. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_META, context.getHandler());
    if (!meta || context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<AppRequest>();
    return next.handle().pipe(
      tap((result: unknown) => {
        const params = req.params as Record<string, string | undefined>;
        const resultId = result && typeof result === 'object' ? (result as { id?: unknown; key?: unknown }) : undefined;
        const entityId =
          params.id ??
          params.key ??
          (typeof resultId?.id === 'string' ? resultId.id : undefined) ??
          (typeof resultId?.key === 'string' ? resultId.key : undefined) ??
          null;
        const ctx = clientContext(req);
        void this.audit.record({
          adminId: req.admin?.id ?? null,
          action: meta.action,
          entity: meta.entity,
          entityId,
          changes: auditChanges(req.body),
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
      }),
    );
  }
}
