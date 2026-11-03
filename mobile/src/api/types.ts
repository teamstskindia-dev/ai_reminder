/**
 * Types mirroring docs/API_CONTRACT.md (user-facing subset). Keep these identical to the contract.
 */

export type ISODate = string;

// ---------- Envelope ----------
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

export interface ValidationIssue {
  /** Dot path, e.g. "value.primaryColor" or "items.2.title". */
  field: string;
  messages: string[];
}

export interface ApiErrorBody {
  success: false;
  statusCode: number;
  error: { code: ErrorCode; message: string; details?: ValidationIssue[] };
  path: string;
  timestamp: string;
  requestId: string;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface PageQuery {
  page?: number;
  limit?: number;
}

// ---------- Icons ----------
export type IconKey =
  | 'home'
  | 'calendar'
  | 'meetings'
  | 'reports'
  | 'analytics'
  | 'action-items'
  | 'reminders'
  | 'ask-ai'
  | 'notifications'
  | 'settings'
  | 'profile'
  | 'help'
  | 'sparkles'
  | 'mic'
  | 'shield'
  | 'zap'
  | 'clock'
  | 'search'
  | 'mail'
  | 'globe'
  | 'users'
  | 'file-text'
  | 'bell'
  | 'check';

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

export type FeatureKey = keyof Features;

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

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconKey | null;
  groupLabel: string | null;
  isExternal: boolean;
  sortOrder: number;
}

export interface Banner {
  id: string;
  placement: 'dashboard' | 'landing_top' | 'mobile_home';
  variant: 'info' | 'success' | 'warning' | 'promo';
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
export interface OnboardingSlideContent {
  title: string;
  description: string;
  imageUrl: string | null;
  backgroundColor: string | null;
}

export interface Cta {
  label: string;
  href: string;
}

export interface HeroContent {
  eyebrow: string | null;
  title: string;
  subtitle: string;
  primaryCta: Cta;
  secondaryCta: Cta | null;
  imageUrl: string | null;
  badges: string[];
}

export interface Section<TContent = unknown> {
  id: string;
  page: string;
  type: string;
  content: TContent;
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

export interface PlanRef {
  id: string;
  slug: string;
  name: string;
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
  plan: PlanRef | null;
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

export interface ExchangeResult {
  user: User;
  tokens: AuthTokens;
  isNewUser: boolean;
}

export interface AuthMe {
  user: User;
  settings: UserSettings;
}

// ---------- Meetings ----------
export type MeetingStatus =
  | 'scheduled'
  | 'joining'
  | 'waiting_room'
  | 'in_progress'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type MeetingPlatform = 'google_meet' | 'zoom' | 'teams' | 'other';

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
  source: 'calendar' | 'manual' | 'upload';
  autoJoin: boolean;
  durationSeconds: number | null;
  organizerEmail: string | null;
  attendeeCount: number;
  actionItemCount: number;
  report: ReportSummary | null;
}

export interface Chapter {
  title: string;
  summary: string;
  startMs: number;
}

export interface KeyQuestion {
  question: string;
  answer: string | null;
  askedBy: string | null;
}

export interface MeetingReport {
  summary: string;
  keyPoints: string[];
  chapters: Chapter[];
  keyQuestions: KeyQuestion[];
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

export type MeetingScope = 'upcoming' | 'past' | 'all';

export interface MeetingListQuery extends PageQuery {
  scope?: MeetingScope;
  status?: MeetingStatus;
  q?: string;
  from?: ISODate;
  to?: ISODate;
  sort?: 'startAt:asc' | 'startAt:desc';
}

export interface CreateMeetingInput {
  title: string;
  meetingUrl: string;
  startAt: ISODate;
  endAt?: ISODate;
  autoJoin?: boolean;
}

export interface UpdateMeetingInput {
  title?: string;
  autoJoin?: boolean;
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

export interface ActionItemListQuery extends PageQuery {
  status?: ActionItemStatus | 'all';
  meetingId?: string;
  mine?: boolean;
}

export interface CreateActionItemInput {
  title: string;
  description?: string;
  dueAt?: ISODate;
  priority?: Priority;
  meetingId?: string;
  remind?: boolean;
}

export interface UpdateActionItemInput {
  title?: string;
  description?: string | null;
  dueAt?: ISODate | null;
  priority?: Priority;
  status?: ActionItemStatus;
}

export type ReminderChannel = 'push' | 'in_app' | 'email';
export type ReminderStatus = 'pending' | 'sent' | 'cancelled' | 'failed';

export interface Reminder {
  id: string;
  type: 'meeting_upcoming' | 'action_item_due' | 'commitment' | 'custom';
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

export interface ReminderListQuery extends PageQuery {
  status?: Exclude<ReminderStatus, 'failed'> | 'all';
  from?: ISODate;
  to?: ISODate;
}

export interface CreateReminderInput {
  title: string;
  body?: string;
  remindAt: ISODate;
  channels?: ReminderChannel[];
  meetingId?: string;
  actionItemId?: string;
}

export interface UpdateReminderInput {
  title?: string;
  body?: string | null;
  remindAt?: ISODate;
  channels?: ReminderChannel[];
  status?: 'cancelled';
}

// ---------- Notifications ----------
export type NotificationType =
  | 'meeting_upcoming'
  | 'report_ready'
  | 'action_item_due'
  | 'reminder'
  | 'daily_digest'
  | 'bot_failed'
  | 'broadcast';

export interface NotificationData {
  meetingId?: string;
  actionItemId?: string;
  reminderId?: string;
  url?: string;
  [k: string]: unknown;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: NotificationData;
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

export interface AskInput {
  question: string;
  threadId?: string;
  meetingId?: string;
}

export interface AskResult {
  threadId: string;
  message: AssistantMessage;
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

export type AnalyticsRange = '7d' | '30d' | '90d';

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

export interface RegisterDeviceInput {
  expoPushToken: string;
  platform: 'android' | 'ios';
  deviceName?: string;
  appVersion?: string;
}

// ---------- Realtime ----------
export interface MeetingUpdatedEvent {
  id: string;
  status: MeetingStatus;
  failureReason: string | null;
}
