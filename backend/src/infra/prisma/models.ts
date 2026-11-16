/**
 * Prisma model types re-exported under `*Row` names so they never clash with the contract DTOs
 * (`User`, `Meeting`, `Reminder`, ...) in src/common/types/api.types.ts.
 */
export type {
  ActionItem as ActionItemRow,
  Admin as AdminRow,
  AiPrompt as AiPromptRow,
  AppSetting as AppSettingRow,
  AssistantMessage as AssistantMessageRow,
  AssistantThread as AssistantThreadRow,
  AuditLog as AuditLogRow,
  AuthSession as AuthSessionRow,
  Banner as BannerRow,
  Broadcast as BroadcastRow,
  CmsPage as CmsPageRow,
  CompanionNudge as CompanionNudgeRow,
  ContentSection as ContentSectionRow,
  DailyCheckin as DailyCheckinRow,
  Device as DeviceRow,
  GoogleAccount as GoogleAccountRow,
  MediaAsset as MediaAssetRow,
  Meeting as MeetingRow,
  MeetingParticipant as MeetingParticipantRow,
  MeetingReport as MeetingReportRow,
  NavigationItem as NavigationItemRow,
  Notification as NotificationRow,
  NotificationTemplate as NotificationTemplateRow,
  Plan as PlanRow,
  Reminder as ReminderRow,
  TranscriptSegment as TranscriptSegmentRow,
  User as UserRow,
  UserSettings as UserSettingsRow,
  WeeklyRecap as WeeklyRecapRow,
} from '../../generated/prisma/client';
export { Prisma } from '../../generated/prisma/client';
