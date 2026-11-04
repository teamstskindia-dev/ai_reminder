import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { ApiDateTime, ApiInteger, ApiUuid } from '../../../common/swagger/api-docs.decorators';
import { QUEUE_NAMES, REMINDER_CHANNELS } from '../../../common/types/api.types';
import type * as Contract from '../../../common/types/api.types';
import { settingValueSchema } from '../../content/content.openapi';
import { Banner, NavItem, Plan, Section } from '../../content/content.responses.dto';
import { SETTING_KEYS, type SettingKey } from '../../content/settings.schemas';
import { Device } from '../../devices/devices.dto';
import { MeetingDetail, MeetingListItem, MeetingReport } from '../../meetings/dto/meetings.responses.dto';
import { AuthTokens, Integration, User, UserSettings } from '../../users/dto/users.responses.dto';

// ---------- auth ----------

export class AdminUser implements Contract.AdminUser {
  @ApiUuid() id: string;
  email: string;
  name: string;
  role: Contract.AdminRole;
  status: 'active' | 'disabled';
  avatarUrl: string | null;
  @ApiDateTime() lastLoginAt: string | null;
  @ApiDateTime() createdAt: string;
}

export class AdminSignInResult {
  admin: AdminUser;
  tokens: AuthTokens;
}

export class AdminTokensResult {
  tokens: AuthTokens;
}

// ---------- users & meetings ----------

export class AdminUserListItem extends User implements Contract.AdminUserListItem {
  @ApiDateTime() lastLoginAt: string | null;
  @ApiInteger({ minimum: 0 }) meetingsCount: number;
}

export class AdminUserStats {
  @ApiInteger({ minimum: 0 }) meetings: number;
  @ApiInteger({ minimum: 0 }) completedMeetings: number;
  @ApiInteger({ minimum: 0 }) actionItems: number;
  @ApiInteger({ minimum: 0 }) reminders: number;
}

export class AdminUserDetail extends AdminUserListItem implements Contract.AdminUserDetail {
  settings: UserSettings;
  integration: Integration;
  devices: Device[];
  stats: AdminUserStats;
}

export class AdminMeetingOwner {
  @ApiUuid() id: string;
  email: string;
  name: string | null;
}

export class AdminMeetingListItem extends MeetingListItem implements Contract.AdminMeetingListItem {
  user: AdminMeetingOwner;
  failureReason: string | null;
}

export class AdminMeetingDetail extends MeetingDetail {
  user: AdminMeetingOwner;
}

// ---------- dashboard / system ----------

export class QueueStats implements Contract.QueueStats {
  @ApiProperty({ enum: QUEUE_NAMES }) name: Contract.QueueName;
  @ApiInteger({ minimum: 0 }) waiting: number;
  @ApiInteger({ minimum: 0 }) active: number;
  @ApiInteger({ minimum: 0 }) delayed: number;
  @ApiInteger({ minimum: 0 }) failed: number;
  @ApiInteger({ minimum: 0 }) completed: number;
  paused: boolean;
}

export class AdminUsersStats {
  @ApiInteger({ minimum: 0 }) total: number;
  @ApiInteger({ minimum: 0 }) newLast7Days: number;
  @ApiInteger({ minimum: 0 }) activeLast7Days: number;
  @ApiInteger({ minimum: 0 }) suspended: number;
}

export class AdminMeetingsStats {
  @ApiInteger({ minimum: 0 }) total: number;
  @ApiInteger({ minimum: 0 }) today: number;
  @ApiInteger({ minimum: 0 }) inProgress: number;
  @ApiInteger({ minimum: 0 }) processing: number;
  @ApiInteger({ minimum: 0 }) failedLast7Days: number;
  @ApiInteger({ minimum: 0 }) completedLast7Days: number;
}

export class AdminActionItemsStats {
  @ApiInteger({ minimum: 0 }) total: number;
  @ApiInteger({ minimum: 0 }) open: number;
}

export class AdminRemindersStats {
  @ApiInteger({ minimum: 0 }) pending: number;
  @ApiInteger({ minimum: 0 }) sentLast7Days: number;
}

export class DailyCount {
  @ApiProperty({ format: 'date', example: '2026-11-03' }) date: string;
  @ApiInteger({ minimum: 0 }) count: number;
}

export class DailyMeetingOutcomes {
  @ApiProperty({ format: 'date', example: '2026-11-03' }) date: string;
  @ApiInteger({ minimum: 0 }) completed: number;
  @ApiInteger({ minimum: 0 }) failed: number;
}

export class AdminDashboardStats implements Contract.AdminDashboardStats {
  users: AdminUsersStats;
  meetings: AdminMeetingsStats;
  actionItems: AdminActionItemsStats;
  reminders: AdminRemindersStats;
  queues: QueueStats[];
  signupsByDay: DailyCount[];
  meetingsByDay: DailyMeetingOutcomes[];
}

export class FailedJob implements Contract.FailedJob {
  id: string;
  name: string;
  failedReason: string;
  @ApiInteger({ minimum: 0 }) attemptsMade: number;
  /** Epoch milliseconds when the job was created. */
  @ApiInteger() timestamp: number;
  /** Job payload. */
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true }) data: unknown;
}

export class RetriedResult {
  @ApiInteger({ minimum: 0 }) retried: number;
}

export class FlushResult {
  /** Number of cache keys removed. */
  @ApiInteger({ minimum: 0 }) flushed: number;
}

// ---------- content ----------

export class AppSettingRecord {
  @ApiProperty({ enum: SETTING_KEYS }) key: SettingKey;
  @ApiProperty(settingValueSchema()) value: unknown;
  /** Included in `GET /public/config`. */
  isPublic: boolean;
  description: string | null;
  @ApiDateTime() updatedAt: string;
}

export class AdminSection extends Section implements Contract.AdminSection {
  /** Admin-facing label. */
  name: string;
  platform: 'web' | 'mobile' | 'all';
  isActive: boolean;
  @ApiDateTime() createdAt: string;
  @ApiDateTime() updatedAt: string;
}

export class AdminNavItem extends NavItem implements Contract.AdminNavItem {
  location: Contract.NavLocation;
  /** Hidden while this feature flag is off. */
  requiredFeature: keyof Contract.Features | null;
  isActive: boolean;
}

export class AdminBanner extends Banner implements Contract.AdminBanner {
  platform: 'web' | 'mobile' | 'all';
  @ApiDateTime() startsAt: string | null;
  @ApiDateTime() endsAt: string | null;
  @ApiInteger() sortOrder: number;
  isActive: boolean;
}

export class AdminPlan extends Plan implements Contract.AdminPlan {
  isActive: boolean;
  @ApiInteger({ minimum: 0 }) usersCount: number;
}

// ---------- media / AI / notifications ----------

export class MediaAsset implements Contract.MediaAsset {
  @ApiUuid() id: string;
  /** Cloudinary public id. */
  publicId: string;
  url: string;
  resourceType: string;
  format: string | null;
  @ApiInteger() width: number | null;
  @ApiInteger() height: number | null;
  @ApiInteger() bytes: number | null;
  folder: string | null;
  alt: string | null;
  @ApiDateTime() createdAt: string;
}

export class AiPrompt implements Contract.AiPrompt {
  key: string;
  name: string;
  description: string | null;
  content: string;
  /** Incremented on every change. */
  @ApiInteger({ minimum: 1 }) version: number;
  @ApiDateTime() updatedAt: string;
}

export class AiTestActionItem implements Partial<Contract.ActionItem> {
  title?: string;
  description?: string | null;
  assigneeName?: string | null;
  isMine?: boolean;
  @ApiDateTime() dueAt?: string | null;
  priority?: Contract.Priority;
  source?: 'ai' | 'manual';
}

export class AiTestReminder {
  title: string;
  @ApiDateTime() remindAt: string;
}

export class AiTestResult {
  report: MeetingReport;
  actionItems: AiTestActionItem[];
  reminders: AiTestReminder[];
  /** Time the AI call took. */
  @ApiInteger({ minimum: 0 }) latencyMs: number;
}

export class NotificationTemplate implements Contract.NotificationTemplate {
  key: string;
  name: string;
  /** Supports `{{variables}}`. */
  titleTemplate: string;
  bodyTemplate: string;
  emailSubject: string | null;
  emailBody: string | null;
  @ApiProperty({ enum: REMINDER_CHANNELS, isArray: true }) channels: Contract.ReminderChannel[];
  isActive: boolean;
  @ApiDateTime() updatedAt: string;
}

export class AllUsersAudience {
  @ApiProperty({ enum: ['all'] }) type: 'all';
}

export class UsersAudience {
  @ApiProperty({ enum: ['users'] }) type: 'users';
  @ApiProperty({ type: String, format: 'uuid', isArray: true }) userIds: string[];
}

export class PlanAudience {
  @ApiProperty({ enum: ['plan'] }) type: 'plan';
  @ApiUuid() planId: string;
}

export class BroadcastCreator {
  @ApiUuid() id: string;
  name: string;
}

@ApiExtraModels(AllUsersAudience, UsersAudience, PlanAudience)
export class Broadcast implements Contract.Broadcast {
  @ApiUuid() id: string;
  title: string;
  body: string;
  @ApiProperty({ enum: REMINDER_CHANNELS, isArray: true }) channels: Contract.ReminderChannel[];
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(AllUsersAudience) },
      { $ref: getSchemaPath(UsersAudience) },
      { $ref: getSchemaPath(PlanAudience) },
    ],
    discriminator: { propertyName: 'type' },
  })
  audience: Contract.BroadcastAudience;
  /** Number of users it was sent to. */
  @ApiInteger({ minimum: 0 }) sentCount: number;
  @ApiDateTime() createdAt: string;
  createdBy: BroadcastCreator | null;
}

export class AuditActor {
  @ApiUuid() id: string;
  name: string;
  email: string;
}

export class AuditLog implements Contract.AuditLog {
  @ApiInteger() id: number;
  /** e.g. `settings.update`. */
  action: string;
  /** Table or area that changed, e.g. `app_settings`. */
  entity: string;
  entityId: string | null;
  /** Redacted request body of the change. */
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true }) changes: unknown;
  ip: string | null;
  @ApiDateTime() createdAt: string;
  admin: AuditActor | null;
}
