/**
 * Response types mirroring docs/API_CONTRACT.md §1 and §5 exactly.
 * Mappers in each module convert snake_case rows into these camelCase shapes.
 */
export type ISODate = string;

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

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------- Public config ----------
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
export const NAV_LOCATIONS: NavLocation[] = ['header', 'footer', 'sidebar', 'mobile_tab'];

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string | null;
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

export interface PublicConfig {
  branding: Branding;
  theme: Theme;
  features: Features;
  app: AppMeta;
  seo: Seo;
  navigation: Record<NavLocation, NavItem[]>;
  banners: Banner[];
  version: string;
}

// ---------- CMS ----------
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

export interface Section {
  id: string;
  page: string;
  type: SectionType;
  content: unknown;
  sortOrder: number;
}

export interface CmsPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  seo: { title: string | null; description: string | null; ogImageUrl: string | null };
  status: 'draft' | 'published';
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

// ---------- Users ----------
export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  timezone: string;
  locale: string;
  status: 'active' | 'suspended';
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

// ---------- Meetings ----------
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
export type MeetingSource = 'calendar' | 'manual' | 'upload';
export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export interface Attendee {
  email: string;
  name: string | null;
  responseStatus: string | null;
  organizer: boolean;
}

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
  source: MeetingSource;
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

// ---------- Action items & reminders ----------
export type Priority = 'low' | 'medium' | 'high';
export type ActionItemStatus = 'open' | 'done' | 'dismissed';

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
  priority: Priority;
  status: ActionItemStatus;
  source: 'ai' | 'manual';
  completedAt: ISODate | null;
  createdAt: ISODate;
}

export const REMINDER_CHANNELS = ['push', 'in_app', 'email'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];
export type ReminderType = 'meeting_upcoming' | 'action_item_due' | 'commitment' | 'custom';
export type ReminderStatus = 'pending' | 'sent' | 'cancelled' | 'failed';

export interface Reminder {
  id: string;
  type: ReminderType;
  title: string;
  body: string | null;
  remindAt: ISODate;
  channels: ReminderChannel[];
  status: ReminderStatus;
  source: 'ai' | 'manual' | 'system';
  meetingId: string | null;
  meetingTitle: string | null;
  actionItemId: string | null;
  sentAt: ISODate | null;
  createdAt: ISODate;
}

// ---------- Notifications ----------
export type NotificationType =
  'meeting_upcoming' | 'report_ready' | 'action_item_due' | 'reminder' | 'daily_digest' | 'bot_failed' | 'broadcast';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  readAt: ISODate | null;
  createdAt: ISODate;
}

// ---------- Ask AI ----------
export interface AssistantSource {
  meetingId: string;
  meetingTitle: string;
  startAt: ISODate;
  snippet: string;
  similarity: number;
}

export interface AssistantThread {
  id: string;
  title: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface AssistantMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  sources: AssistantSource[];
  createdAt: ISODate;
}

// ---------- Dashboard / analytics ----------
export interface DashboardHome {
  stats: {
    meetingsThisWeek: number;
    hoursThisWeek: number;
    openActionItems: number;
    pendingReminders: number;
    avgMeetingScore: number | null;
  };
  upcomingMeetings: MeetingListItem[];
  recentReports: MeetingListItem[];
  openActionItems: ActionItem[];
  upcomingReminders: Reminder[];
  banners: Banner[];
}

export interface AnalyticsOverview {
  range: { from: ISODate; to: ISODate };
  totals: {
    meetings: number;
    totalMinutes: number;
    avgMeetingMinutes: number;
    avgMeetingScore: number | null;
    avgEngagementScore: number | null;
    avgSentimentScore: number | null;
    actionItemsCreated: number;
    actionItemsCompleted: number;
  };
  byDay: { date: string; meetings: number; minutes: number; avgScore: number | null }[];
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  topTopics: { topic: string; count: number }[];
  topParticipants: { name: string; meetings: number; talkTimeSeconds: number }[];
  byHourOfDay: { hour: number; meetings: number }[];
}

// ---------- Integrations / devices ----------
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

// ---------- Admin ----------
export const ADMIN_ROLES = ['super_admin', 'admin', 'editor', 'viewer'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  status: 'active' | 'disabled';
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

export interface AdminMeetingListItem extends MeetingListItem {
  user: { id: string; email: string; name: string | null };
  failureReason: string | null;
}

export const QUEUE_NAMES = ['calendar-sync', 'meeting-bot', 'ai-processing', 'notifications', 'digest'] as const;
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

export interface FailedJob {
  id: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  data: unknown;
}

export interface AdminSection extends Section {
  name: string;
  platform: 'web' | 'mobile' | 'all';
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
  platform: 'web' | 'mobile' | 'all';
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
  { type: 'all' } | { type: 'users'; userIds: string[] } | { type: 'plan'; planId: string };

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
