import { ApiProperty } from '@nestjs/swagger';
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
  /** Push the morning brief at `wakeTime`. */
  morningBrief: boolean;
  /** Ask "how did today go?" at `checkinTime`. */
  eveningCheckin: boolean;
  /** Push important emails. */
  emailAlerts: boolean;
  /** Senders that always alert, even in quiet hours (lower-case emails). */
  vipSenders: string[];
  /** Senders marked "not important": never alert. */
  mutedSenders: string[];
  /** Normal pushes per local day before the rest are bundled into one. */
  @ApiInteger({ minimum: 1, maximum: 50 }) pushBudget: number;
  /** Critical alerts (timed reminders, meeting starting, urgent email) may break through quiet hours. */
  criticalBreakThrough: boolean;
  /** Focus mode until this time (`null` = off). */
  @ApiDateTime() focusUntil: string | null;
  /** "Take a break" from the friend's nudges until this time (`null` = off). */
  @ApiDateTime() nudgesPausedUntil: string | null;
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

export class IntegrationSettings implements Contract.IntegrationSettings {
  /** Email: replies the user approved can be sent from this account (read + send). */
  canSend: boolean | null;
  /** Tools: default Notion database / Jira project / Linear team / Todoist project. */
  targetId: string | null;
  targetName: string | null;
  /** Tools: create tasks without asking first. */
  autoSend: boolean;
}

export class Integration implements Contract.Integration {
  @ApiProperty({ enum: ['google_calendar', 'gmail', 'outlook', 'notion', 'jira', 'linear', 'todoist'] })
  provider: Contract.IntegrationProvider;
  @ApiProperty({ enum: ['calendar', 'email', 'tasks'] }) kind: 'calendar' | 'email' | 'tasks';
  /** False when the server has no OAuth client for this provider (show it as "coming soon"). */
  available: boolean;
  connected: boolean;
  @ApiProperty({ enum: ['connected', 'needs_reconnect', 'not_connected'] })
  status: 'connected' | 'needs_reconnect' | 'not_connected';
  /** Account email, or the workspace / site name for tools. */
  accountEmail: string | null;
  @ApiDateTime() lastSyncedAt: string | null;
  /** Last sync error shown to the user; `null` when the last sync worked. */
  syncError: string | null;
  @ApiProperty({ type: IntegrationSettings, nullable: true }) settings: IntegrationSettings | null;
}

export class IntegrationTarget implements Contract.IntegrationTarget {
  id: string;
  name: string;
}

export class ConnectUrl {
  /** Open in an auth session (ASWebAuthenticationSession / Custom Tabs); the provider redirects back to the app. */
  url: string;
}
