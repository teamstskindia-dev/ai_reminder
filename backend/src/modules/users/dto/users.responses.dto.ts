import { ApiDateTime, ApiInteger, ApiUuid } from '../../../common/swagger/api-docs.decorators';
import type * as Contract from '../../../common/types/api.types';
import { PlanRef } from '../../content/content.responses.dto';

export class User implements Contract.User {
  @ApiUuid() id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  /** IANA time zone, e.g. `Asia/Kolkata`. */
  timezone: string;
  /** BCP-47 tag, e.g. `en` or `en-IN`. */
  locale: string;
  status: 'active' | 'suspended';
  plan: PlanRef | null;
  calendarConnected: boolean;
  @ApiDateTime() onboardedAt: string | null;
  @ApiDateTime() createdAt: string;
}

export class UserSettings implements Contract.UserSettings {
  /** Which calendar meetings the bot joins automatically. */
  autoJoin: Contract.AutoJoinMode;
  /** `null` = the global bot name. */
  botName: string | null;
  /** Minutes before a meeting to send the reminder (0 = off). */
  @ApiInteger({ minimum: 0, maximum: 1440 }) meetingReminderMinutes: number;
  dailyDigest: boolean;
  /** Local hour (user time zone) at which the daily digest is sent. */
  @ApiInteger({ minimum: 0, maximum: 23 }) digestHour: number;
  emailNotifications: boolean;
  pushNotifications: boolean;
  /** Local wake time, "HH:MM" (24h). */
  wakeTime: string;
  /** Start of quiet hours, "HH:MM" (24h). */
  quietHoursStart: string;
  /** End of quiet hours, "HH:MM" (24h). */
  quietHoursEnd: string;
  /** Local time of the evening check-in, "HH:MM" (24h). */
  checkinTime: string;
  /** When the user acknowledged the one-time recording-consent note. */
  @ApiDateTime() recordingConsentAt: string | null;
}

export class AuthTokens implements Contract.AuthTokens {
  /** Short-lived JWT. Send as `Authorization: Bearer <accessToken>`. */
  accessToken: string;
  /** Opaque, single-use refresh token (rotated on every refresh). */
  refreshToken: string;
  /** Access token lifetime in seconds. */
  @ApiInteger() expiresIn: number;
}

export class TokensResult {
  tokens: AuthTokens;
}

export class SignInResult {
  user: User;
  tokens: AuthTokens;
  /** True when this sign-in created the account. */
  isNewUser: boolean;
}

export class MeResult {
  user: User;
  settings: UserSettings;
}

export class Integration implements Contract.Integration {
  provider: 'google_calendar';
  connected: boolean;
  accountEmail: string | null;
  @ApiDateTime() lastSyncedAt: string | null;
  /** Last sync error shown to the user; `null` when the last sync worked. */
  syncError: string | null;
}
