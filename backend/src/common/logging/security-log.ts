import { Logger } from '@nestjs/common';

const logger = new Logger('Security');

export type SecurityEvent =
  | 'refresh_token_reuse'
  | 'pkce_verification_failed'
  | 'oauth_state_invalid'
  | 'oauth_redirect_rejected'
  | 'admin_login_failed'
  | 'admin_login_locked'
  | 'admin_sessions_revoked'
  | 'user_sessions_revoked'
  | 'google_grant_revoked'
  | 'email_code_failed';

/** Security events are logged at `warn` with a `security` tag so they can be alerted on. */
export function securityLog(event: SecurityEvent, fields: Record<string, unknown> = {}): void {
  logger.warn({ tag: 'security', event, ...fields }, `security: ${event}`);
}
