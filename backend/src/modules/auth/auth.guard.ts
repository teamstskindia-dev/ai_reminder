import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContext } from '../../common/context/request-context';
import { AppException } from '../../common/errors/app.exception';
import type { AppRequest } from '../../common/http/request.types';
import type { AdminRole } from '../../common/types/api.types';
import { AdminsRepository } from './admins.repository';
import { COOKIES, extractAccessToken } from './auth-cookies.service';
import { AUTH_META, AuthRequirement, hasRole } from './auth.decorators';
import { TokenService } from './token.service';

/**
 * Global guard driven by @UserAuth() / @AdminAuth(role) metadata (handler overrides class).
 * Routes without metadata are public.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly admins: AdminsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const requirement = this.reflector.getAllAndOverride<AuthRequirement | undefined>(AUTH_META, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirement) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const cookies = req.cookies as Record<string, string | undefined> | undefined;

    if (requirement.kind === 'user') {
      const token = extractAccessToken(req.headers, cookies, COOKIES.userAccess);
      if (!token) throw AppException.unauthorized();
      const payload = await this.tokens.verifyUser(token);
      req.user = { id: payload.sub };
      RequestContext.set({ userId: payload.sub });
      return true;
    }

    const token = extractAccessToken(req.headers, cookies, COOKIES.adminAccess);
    if (!token) throw AppException.unauthorized();
    const payload = await this.tokens.verifyAdmin(token);
    const admin = await this.admins.findById(payload.sub);
    if (!admin || admin.status !== 'active') throw AppException.unauthorized('Admin account is not active');
    if (!hasRole(admin.role as AdminRole, requirement.minRole)) {
      throw AppException.forbidden(`This action requires the ${requirement.minRole} role`);
    }
    req.admin = admin;
    RequestContext.set({ adminId: admin.id });
    return true;
  }
}
