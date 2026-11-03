import { createEmitter } from '@/utils/emitter';

/** Fired when any API call answers 503 MAINTENANCE. The config provider flips into maintenance view. */
export const maintenanceEvents = createEmitter<{ message: string | null }>();

/** Fired when the session can no longer be refreshed; the auth provider signs the user out. */
export const sessionExpiredEvents = createEmitter<{ reason: 'refresh_failed' }>();
