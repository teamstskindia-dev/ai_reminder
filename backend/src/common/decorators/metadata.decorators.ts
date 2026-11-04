import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';
import { OPENAPI_EXT } from '../swagger/api-docs.decorators';

export const SKIP_ENVELOPE = 'remi:skip-envelope';
export const MAINTENANCE_EXEMPT = 'remi:maintenance-exempt';
export const THROTTLE_BY_USER = 'remi:throttle-by-user';

/** Return the handler result as-is (no `{ success, data }` wrapper). */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE, true);

/** Keep working while `app.maintenanceMode` is on (public, auth, health, admin). */
export const MaintenanceExempt = () =>
  applyDecorators(SetMetadata(MAINTENANCE_EXEMPT, true), ApiExtension(OPENAPI_EXT.maintenanceExempt, true));

/** Rate-limit by authenticated user id instead of client IP. */
export const ThrottleByUser = () => SetMetadata(THROTTLE_BY_USER, true);
