import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiExtension } from '@nestjs/swagger';
import { MaintenanceExempt } from '../../common/decorators/metadata.decorators';
import { AppException } from '../../common/errors/app.exception';
import { OPENAPI_EXT } from '../../common/swagger/api-docs.decorators';
import type { AppRequest } from '../../common/http/request.types';
import type { AdminRole } from '../../common/types/api.types';
import type { AdminRow } from '../../infra/prisma/models';
import { COOKIES } from './auth-cookies.service';

export const AUTH_META = 'remi:auth';

export type AuthRequirement = { kind: 'user' } | { kind: 'admin'; minRole: AdminRole };

/** End-user endpoint: JWT from `Authorization: Bearer` or the `remi_at` cookie. */
export const UserAuth = () => {
  const requirement: AuthRequirement = { kind: 'user' };
  return applyDecorators(
    SetMetadata(AUTH_META, requirement),
    ApiExtension(OPENAPI_EXT.auth, requirement),
    ApiBearerAuth('bearer'),
    ApiCookieAuth(COOKIES.userAccess),
  );
};

/** Admin endpoint with a minimum role (role hierarchy super_admin > admin > editor > viewer). */
export const AdminAuth = (minRole: AdminRole = 'viewer') => {
  const requirement: AuthRequirement = { kind: 'admin', minRole };
  return applyDecorators(
    SetMetadata(AUTH_META, requirement),
    ApiExtension(OPENAPI_EXT.auth, requirement),
    MaintenanceExempt(),
    ApiBearerAuth('admin-bearer'),
    ApiCookieAuth(COOKIES.adminAccess),
  );
};

export const CurrentUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.user) throw AppException.unauthorized();
  return req.user.id;
});

export const CurrentAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext): AdminRow => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.admin) throw AppException.unauthorized();
  return req.admin;
});

export const ROLE_RANK: Record<AdminRole, number> = { viewer: 0, editor: 1, admin: 2, super_admin: 3 };

export function hasRole(role: AdminRole, minRole: AdminRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export function assertRole(admin: AdminRow, minRole: AdminRole): void {
  if (!hasRole(admin.role as AdminRole, minRole)) {
    throw AppException.forbidden(`This action requires the ${minRole} role`);
  }
}
