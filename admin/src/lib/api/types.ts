/**
 * Remi API contract types (docs/API_CONTRACT.md, v1).
 * This is the single place where contract shapes live in the admin panel.
 * Keep this file in sync with the contract — do not add admin-only fields here.
 */

export type ISODate = string;

// ---------------------------------------------------------------------------
// §0 Conventions
// ---------------------------------------------------------------------------

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PLAN_LIMIT_REACHED'
  | 'UPSTREAM_ERROR'
  | 'MAINTENANCE'
  | 'INTERNAL_ERROR';

/** `error.details` entries for VALIDATION_ERROR. `field` is a dot path, e.g. "value.primaryColor" or "items.2.title". */
export interface ValidationIssue {
  field: string;
  messages: string[];
}

/** @deprecated use ValidationIssue */
export type ValidationDetail = ValidationIssue;

export interface ApiErrorBody {
  success: false;
  statusCode: number;
  error: { code: ErrorCode; message: string; details?: ValidationIssue[] };
  path: string;
  timestamp: string;
  /** Also sent as the `X-Request-Id` response header. */
  requestId: string;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

// ---------------------------------------------------------------------------
// §1 Shared types
// ---------------------------------------------------------------------------

export interface Branding {
  appName: string;
  tagline: string;
  logoUrl: string;
  logoDarkUrl: string;
  iconUrl: string;
  faviconUrl: string;
  supportEmail: string;
  companyName: string;
}

export interface Theme {
  primaryColor: string;
  primaryForeground: string;
  accentColor: string;
  sidebarBackground: string;
  sidebarForeground: string;
  radius: number;
  fontFamily: string;
  defaultMode: 'light' | 'dark' | 'system';
}

export interface Features {
  askAi: boolean;
  analytics: boolean;
  reminders: boolean;
  actionItems: boolean;
  calendarSync: boolean;
  meetingUpload: boolean;
  pushNotifications: boolean;
  signupsEnabled: boolean;
}

export interface AppMeta {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  minAppVersion: string;
  latestAppVersion: string;
  androidStoreUrl: string;
  iosStoreUrl: string;
}

export interface Seo {
  title: string;
  description: string;
  ogImageUrl: string;
  keywords: string[];
}

export type NavLocation = 'header' | 'footer' | 'sidebar' | 'mobile_tab';

export const ICON_KEYS = [
  'home',
  'calendar',
  'meetings',
  'reports',
  'analytics',
  'action-items',
  'reminders',
  'ask-ai',
  'notifications',
  'settings',
  'profile',
  'help',
  'sparkles',
  'mic',
  'shield',
  'zap',
  'clock',
  'search',
  'mail',
  'globe',
  'users',
  'file-text',
  'bell',
  'check',
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconKey | null;
  groupLabel: string | null;
  isExternal: boolean;
  sortOrder: number;
}

export type BannerPlacement = 'dashboard' | 'landing_top' | 'mobile_home';
export type BannerVariant = 'info' | 'success' | 'warning' | 'promo';

export interface Banner {
  id: string;
  placement: BannerPlacement;
  variant: BannerVariant;
  title: string;
  body: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

export const SECTION_TYPES = [
  'hero',
  'logos',
  'features',
  'steps',
  'stats',
  'testimonials',
  'pricing',
  'faq',
  'cta',
  'rich_text',
  'onboarding_slide',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export interface Cta {
  label: string;
  href: string;
}

export interface SectionContent {
  hero: {
    eyebrow: string | null;
    title: string;
    subtitle: string;
    primaryCta: Cta;
    secondaryCta: Cta | null;
    imageUrl: string | null;
    badges: string[];
  };
  logos: { title: string; items: { name: string; imageUrl: string }[] };
  features: {
    eyebrow: string | null;
    title: string;
    subtitle: string | null;
    items: { icon: IconKey; title: string; description: string; imageUrl: string | null }[];
  };
  steps: { title: string; subtitle: string | null; items: { title: string; description: string }[] };
  stats: { items: { value: string; label: string }[] };
  testimonials: {
    title: string;
    items: { quote: string; name: string; role: string; avatarUrl: string | null }[];
  };
  pricing: { title: string; subtitle: string | null };
  faq: { title: string; items: { question: string; answer: string }[] };
  cta: { title: string; subtitle: string | null; cta: Cta };
  rich_text: { markdown: string };
  onboarding_slide: {
    title: string;
    description: string;
    imageUrl: string | null;
    backgroundColor: string | null;
  };
}

export interface Section<T extends SectionType = SectionType> {
  id: string;
  page: string;
  type: T;
  content: SectionContent[T];
  sortOrder: number;
}

export type CmsPageStatus = 'draft' | 'published';

export interface CmsPageSeo {
  title: string | null;
  description: string | null;
  ogImageUrl: string | null;
}

export interface CmsPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  seo: CmsPageSeo;
  status: CmsPageStatus;
  publishedAt: ISODate | null;
  updatedAt: ISODate;
}

export interface PlanLimits {
  meetingsPerMonth: number | null;
  aiQueriesPerDay: number | null;
  uploadMinutesPerMonth: number | null;
}

export interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  features: string[];
  limits: PlanLimits;
  ctaLabel: string | null;
  isPopular: boolean;
  isDefault: boolean;
  sortOrder: number;
}

export type UserStatus = 'active' | 'suspended';

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  timezone: string;
  locale: string;
  status: UserStatus;
  plan: Pick<Plan, 'id' | 'slug' | 'name'> | null;
  calendarConnected: boolean;
  onboardedAt: ISODate | null;
  createdAt: ISODate;
}

export type AutoJoinMode = 'all' | 'owned' | 'none';

export interface UserSettings {
  autoJoin: AutoJoinMode;
  botName: string | null;
  meetingReminderMinutes: number;
  dailyDigest: boolean;
  digestHour: number;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const MEETING_STATUSES = [
  'scheduled',
  'joining',
  'waiting_room',
  'in_progress',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'skipped',
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export type MeetingPlatform = 'google_meet' | 'zoom' | 'teams' | 'other';

export interface Attendee {
  email: string;
  name: string | null;
  responseStatus: string | null;
  organizer: boolean;
}

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export interface ReportSummary {
  summaryPreview: string;
  meetingScore: number | null;
  engagementScore: number | null;
  sentimentScore: number | null;
  sentimentLabel: SentimentLabel | null;
  topics: string[];
}

export interface MeetingListItem {
  id: string;
  title: string;
  startAt: ISODate;
  endAt: ISODate | null;
  platform: MeetingPlatform;
  meetingUrl: string | null;
  status: MeetingStatus;
  source: 'calendar' | 'manual' | 'upload';
  autoJoin: boolean;
  durationSeconds: number | null;
  organizerEmail: string | null;
  attendeeCount: number;
  actionItemCount: number;
  report: ReportSummary | null;
}

export interface MeetingReport {
  summary: string;
  keyPoints: string[];
  chapters: { title: string; summary: string; startMs: number }[];
  keyQuestions: { question: string; answer: string | null; askedBy: string | null }[];
  decisions: string[];
  topics: string[];
  meetingScore: number | null;
  engagementScore: number | null;
  sentimentScore: number | null;
  sentimentLabel: SentimentLabel | null;
  model: string | null;
  createdAt: ISODate;
}

export interface Participant {
  id: string;
  name: string;
  email: string | null;
  talkTimeSeconds: number;
  wordCount: number;
  talkRatio: number;
}

export interface MeetingDetail extends Omit<MeetingListItem, 'report'> {
  description: string | null;
  attendees: Attendee[];
  participants: Participant[];
  report: MeetingReport | null;
  actionItems: ActionItem[];
  botJoinedAt: ISODate | null;
  botLeftAt: ISODate | null;
  failureReason: string | null;
}

export interface TranscriptSegment {
  seq: number;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number | null;
}

export type ActionItemPriority = 'low' | 'medium' | 'high';

export interface ActionItem {
  id: string;
  meetingId: string | null;
  meetingTitle: string | null;
  title: string;
  description: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  isMine: boolean;
  dueAt: ISODate | null;
  priority: ActionItemPriority;
  status: 'open' | 'done' | 'dismissed';
  source: 'ai' | 'manual';
  completedAt: ISODate | null;
  createdAt: ISODate;
}

export const REMINDER_CHANNELS = ['push', 'in_app', 'email'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export interface Integration {
  provider: 'google_calendar';
  connected: boolean;
  accountEmail: string | null;
  lastSyncedAt: ISODate | null;
  syncError: string | null;
}

export interface Device {
  id: string;
  platform: 'android' | 'ios' | 'web';
  deviceName: string | null;
  appVersion: string | null;
  lastSeenAt: ISODate;
}

// ---------------------------------------------------------------------------
// §5 Admin types
// ---------------------------------------------------------------------------

export const ADMIN_ROLES = ['super_admin', 'admin', 'editor', 'viewer'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export type AdminStatus = 'active' | 'disabled';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  status: AdminStatus;
  avatarUrl: string | null;
  lastLoginAt: ISODate | null;
  createdAt: ISODate;
}

export interface AdminUserListItem extends User {
  lastLoginAt: ISODate | null;
  meetingsCount: number;
}

export interface AdminUserDetail extends AdminUserListItem {
  settings: UserSettings;
  integration: Integration;
  devices: Device[];
  stats: { meetings: number; completedMeetings: number; actionItems: number; reminders: number };
}

export interface MeetingUserRef {
  id: string;
  email: string;
  name: string | null;
}

export interface AdminMeetingListItem extends MeetingListItem {
  user: MeetingUserRef;
  failureReason: string | null;
}

export type AdminMeetingDetail = MeetingDetail & { user: MeetingUserRef };

export const QUEUE_NAMES = [
  'calendar-sync',
  'meeting-bot',
  'bot-events',
  'ai-processing',
  'notifications',
  'digest',
] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export interface QueueStats {
  name: QueueName;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: boolean;
}

export interface FailedJob {
  id: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  data: unknown;
}

export interface AdminDashboardStats {
  users: { total: number; newLast7Days: number; activeLast7Days: number; suspended: number };
  meetings: {
    total: number;
    today: number;
    inProgress: number;
    processing: number;
    failedLast7Days: number;
    completedLast7Days: number;
  };
  actionItems: { total: number; open: number };
  reminders: { pending: number; sentLast7Days: number };
  queues: QueueStats[];
  signupsByDay: { date: string; count: number }[];
  meetingsByDay: { date: string; completed: number; failed: number }[];
}

export interface AiSettings {
  model: string;
  embeddingModel: string;
  temperature: number;
  maxOutputTokens: number;
  outputLanguage: string;
  enableEmbeddings: boolean;
}

export type BotProvider = 'self_hosted' | 'recall';
export type RecallTranscription = 'recallai_streaming' | 'meeting_captions';

export interface RecallBotSettings {
  transcription: RecallTranscription;
  languageCode: string;
  deleteMediaAfterImport: boolean;
}

export interface BotSettings {
  provider: BotProvider;
  recall: RecallBotSettings;
  botName: string;
  joinBeforeMinutes: number;
  waitingRoomTimeoutMinutes: number;
  maxDurationMinutes: number;
  leaveWhenAloneMinutes: number;
  autoJoinDefault: AutoJoinMode;
  headless: boolean;
  selectors: Record<string, string>;
}

/** GET /admin/bot/providers — secrets are only reported as set / not set. */
export interface BotProviderStatus {
  recall: {
    apiKeyConfigured: boolean;
    webhookSecretConfigured: boolean;
    region: string;
    webhookUrl: string;
    dashboardUrl: string;
  };
  selfHosted: { mode: 'puppeteer' | 'simulate'; persistentProfile: boolean };
}

export interface RecallConnectionTest {
  ok: boolean;
  message: string;
}

export interface NotificationSettings {
  pushEnabled: boolean;
  emailEnabled: boolean;
  fromName: string;
  fromEmail: string;
  defaultMeetingReminderMinutes: number;
  digestEnabled: boolean;
}

export interface SettingValue {
  branding: Branding;
  theme: Theme;
  features: Features;
  app: AppMeta;
  seo: Seo;
  ai: AiSettings;
  bot: BotSettings;
  notifications: NotificationSettings;
}

export type SettingKey = keyof SettingValue;
export const SETTING_KEYS = [
  'branding',
  'theme',
  'features',
  'app',
  'seo',
  'ai',
  'bot',
  'notifications',
] as const satisfies readonly SettingKey[];

export interface AppSettingRecord<K extends SettingKey = SettingKey> {
  key: K;
  value: SettingValue[K];
  isPublic: boolean;
  description: string | null;
  updatedAt: ISODate;
}

export type Platform = 'web' | 'mobile' | 'all';

export interface AdminSection extends Section {
  name: string;
  platform: Platform;
  isActive: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface AdminNavItem extends NavItem {
  location: NavLocation;
  requiredFeature: keyof Features | null;
  isActive: boolean;
}

export interface AdminBanner extends Banner {
  platform: Platform;
  startsAt: ISODate | null;
  endsAt: ISODate | null;
  sortOrder: number;
  isActive: boolean;
}

export interface AdminPlan extends Plan {
  isActive: boolean;
  usersCount: number;
}

export interface MediaAsset {
  id: string;
  publicId: string;
  url: string;
  resourceType: string;
  format: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  folder: string | null;
  alt: string | null;
  createdAt: ISODate;
}

export interface AiPrompt {
  key: string;
  name: string;
  description: string | null;
  content: string;
  version: number;
  updatedAt: ISODate;
}

export interface NotificationTemplate {
  key: string;
  name: string;
  titleTemplate: string;
  bodyTemplate: string;
  emailSubject: string | null;
  emailBody: string | null;
  channels: ReminderChannel[];
  isActive: boolean;
  updatedAt: ISODate;
}

export type BroadcastAudience =
  | { type: 'all' }
  | { type: 'users'; userIds: string[] }
  | { type: 'plan'; planId: string };

export interface Broadcast {
  id: string;
  title: string;
  body: string;
  channels: ReminderChannel[];
  audience: BroadcastAudience;
  sentCount: number;
  createdAt: ISODate;
  createdBy: { id: string; name: string } | null;
}

export interface AuditLog {
  id: number;
  action: string;
  entity: string;
  entityId: string | null;
  changes: unknown;
  ip: string | null;
  createdAt: ISODate;
  admin: { id: string; name: string; email: string } | null;
}

export interface AiTestResult {
  report: MeetingReport;
  actionItems: Partial<ActionItem>[];
  reminders: { title: string; remindAt: ISODate }[];
  latencyMs: number;
}
