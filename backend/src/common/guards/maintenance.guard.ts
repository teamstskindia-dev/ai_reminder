import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SettingsService } from '../../modules/content/settings.service';
import { MAINTENANCE_EXEMPT } from '../decorators/metadata.decorators';
import { AppException } from '../errors/app.exception';

/** 503 MAINTENANCE for user endpoints while `app.maintenanceMode` is on (public/auth/health/admin are exempt). */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const exempt = this.reflector.getAllAndOverride<boolean>(MAINTENANCE_EXEMPT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (exempt) return true;
    const app = await this.settings.get('app');
    if (app.maintenanceMode) throw AppException.maintenance(app.maintenanceMessage || 'We are down for maintenance.');
    return true;
  }
}
