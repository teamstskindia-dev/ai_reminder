import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE = 'remi:skip-envelope';
export const MAINTENANCE_EXEMPT = 'remi:maintenance-exempt';
export const THROTTLE_BY_USER = 'remi:throttle-by-user';

/** Return the handler result as-is (no `{ success, data }` wrapper). */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE, true);

/** Keep working while `app.maintenanceMode` is on (public, auth, health, admin). */
export const MaintenanceExempt = () => SetMetadata(MAINTENANCE_EXEMPT, true);

/** Rate-limit by authenticated user id instead of client IP. */
export const ThrottleByUser = () => SetMetadata(THROTTLE_BY_USER, true);
