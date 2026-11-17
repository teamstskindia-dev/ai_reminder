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
  /** Daily rhythm, local "HH:MM" (24h). */
  wakeTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  checkinTime: string;
  recordingConsentAt: ISODate | null;
  /** Push the morning brief at `wakeTime`. */
  morningBrief: boolean;
  /** Ask "how did today go?" at `checkinTime`. */
  eveningCheckin: boolean;
}

/** PATCH /me/settings body: settings fields plus write-only flags. */
export type UserSettingsPatch = Partial<Omit<UserSettings, 'recordingConsentAt'>> & {
  recordingConsentAcknowledged?: true;
};

// ---------- Companion profile and onboarding ----------
export type ProfileStatus = 'pending' | 'completed' | 'skipped';
export type LanguageStyle = 'english' | 'hinglish' | 'mixed';

export interface UserProfile {
  status: ProfileStatus;
  preferredName: string | null;
  occupation: string | null;
  currentFocus: string | null;
  communicationStyle: string | null;
  languageStyle: LanguageStyle;
  tone: string | null;
  facts: string[];
  summary: string | null;
  /** 1 polite and curious, 2 casual, 3 close friend (grows nightly with warmth). */
  relationshipStage: number;
  updatedAt: ISODate | null;
}

export interface OnboardingChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OnboardingChatReply {
  reply: string;
  step: number;
  totalSteps: number;
  done: boolean;
  languageStyle: LanguageStyle;
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
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type MeetingPlatform = 'google_meet' | 'zoom' | 'teams' | 'other' | 'in_person';

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
  /** `capture` = a conversation recorded in the app (open it with /capture/[id]). */
  source: 'calendar' | 'manual' | 'upload' | 'capture';
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
  /** The most recent recording linked to this meeting (recorded on the phone). */
  recordingId: string | null;
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
export type ReminderStatus = 'pending' | 'sent' | 'done' | 'cancelled' | 'failed';

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
  doneAt: ISODate | null;
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
  | 'welcome'
  | 'broadcast'
  | 'morning_brief'
  | 'evening_checkin'
  | 'reminder_followup'
  | 'companion_nudge'
  | 'weekly_recap'
  | 'capture_ready'
  | 'meeting_start'
  | 'meeting_notes';

export interface NotificationData {
  meetingId?: string;
  actionItemId?: string;
  reminderId?: string;
  /** A recorded conversation (opens the review card). */
  captureId?: string;
  url?: string;
  [k: string]: unknown;
}

// ---------- Tap to record a conversation (captures) ----------
export type CaptureStatus = 'uploading' | 'processing' | 'completed' | 'failed';
export type CaptureMood = 'happy' | 'calm' | 'neutral' | 'stressed' | 'low';

export interface CaptureBookmark {
  atMs: number;
  label: string | null;
}

export interface CapturePerson {
  name: string;
  relation: string | null;
  notes: string[];
}

export interface CaptureSuggestionOption {
  label: string;
  title: string;
  remindAt: ISODate | null;
}

/** A reminder the friend did not set because something was unclear ("Rohit or Rahul?"). */
export interface CaptureSuggestion {
  id: string;
  title: string;
  body: string | null;
  remindAt: ISODate | null;
  question: string;
  options: CaptureSuggestionOption[];
  status: 'open' | 'confirmed' | 'dismissed';
  reminderId: string | null;
}

export interface CaptureInsights {
  people: CapturePerson[];
  userFacts: string[];
  savedFacts: string[];
  mood: CaptureMood | null;
  energy: number | null;
  suggestions: CaptureSuggestion[];
}

export interface CaptureListItem {
  id: string;
  title: string;
  status: CaptureStatus;
  startAt: ISODate;
  durationSeconds: number | null;
  summaryPreview: string | null;
  actionItemCount: number;
  reminderCount: number;
  openSuggestionCount: number;
  reviewedAt: ISODate | null;
  failureReason: string | null;
  noSpeech: boolean;
  createdAt: ISODate;
}

export interface CaptureDetail extends CaptureListItem {
  summary: string | null;
  keyPoints: string[];
  decisions: string[];
  bookmarks: CaptureBookmark[];
  actionItems: ActionItem[];
  reminders: Reminder[];
  insights: CaptureInsights | null;
  partsUploaded: number;
  audioKept: boolean;
  /** The calendar meeting this recording belongs to. */
  linkedMeeting: MeetingRef | null;
  /** Calendar meetings around the recording time it may belong to (only when not linked). */
  eventSuggestions: MeetingRef[];
  /** Recap email to the attendees, sent from the user's own email app after they approve it. */
  followUp: FollowUpDraft | null;
}

export interface MeetingRef {
  id: string;
  title: string;
  startAt: ISODate;
  endAt: ISODate | null;
}

export interface FollowUpDraft {
  to: { name: string | null; email: string }[];
  subject: string;
  body: string;
  status: 'draft' | 'sent' | 'skipped';
}

// ---------- Google Calendar and meetings (user-flow §06) ----------
export interface MeetingPrep {
  meetingId: string;
  title: string;
  startAt: ISODate;
  endAt: ISODate | null;
  attendees: { name: string | null; email: string }[];
  lastDiscussed: { id: string; title: string; startAt: ISODate; summaryPreview: string | null; isCapture: boolean }[];
  promises: { mine: ActionItem[]; theirs: ActionItem[] };
  talkingPoints: string[];
  conflicts: MeetingRef[];
  nextUp: MeetingRef | null;
  recordingId: string | null;
}

// ---------- Talk with your friend (user-flow §05) ----------
export type TalkIntent = 'vent' | 'advice' | 'recall' | 'task' | 'chat';

export type TalkAction =
  | { id: string; type: 'reminder'; status: 'done' | 'failed'; title: string; remindAt: ISODate | null; reminderId: string | null; note: string | null }
  | {
      id: string;
      type: 'meeting';
      status: 'proposed' | 'scheduled' | 'cancelled' | 'needs_connection' | 'failed';
      title: string;
      startAt: ISODate | null;
      endAt: ISODate | null;
      attendees: { name: string | null; email: string | null }[];
      eventId: string | null;
      note: string | null;
    }
  | { id: string; type: 'email'; status: 'proposed' | 'sent' | 'cancelled'; to: string | null; subject: string; body: string; note: string | null }
  | { id: string; type: 'task'; status: 'done' | 'failed'; title: string; tool: string; actionItemId: string | null; note: string | null }
  | { id: string; type: 'unavailable'; status: 'info'; feature: 'email_read' | 'tool'; note: string };

export interface TalkMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: AssistantSource[];
  actions: TalkAction[];
  intent: TalkIntent | null;
  crisis: boolean;
  createdAt: ISODate;
}

export interface TalkReply {
  threadId: string | null;
  userMessage: TalkMessage;
  reply: TalkMessage;
}

export interface TalkThread {
  id: string;
  title: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface CaptureReviewInput {
  suggestions?: { id: string; action: 'confirm' | 'dismiss'; title?: string; remindAt?: string }[];
  saveFacts?: string[];
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

// ---------- Daily rhythm: Today, evening check-in, nudges, weekly recap ----------
export interface CompanionMessage {
  role: 'user' | 'assistant';
  content: string;
  at: ISODate;
}

export type CheckinStatus = 'prompted' | 'replied' | 'completed' | 'missed';

export interface DailyCheckin {
  id: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  status: CheckinStatus;
  tone: 'normal' | 'light';
  messages: CompanionMessage[];
  mood: number | null;
  energy: number | null;
  wins: string[];
  summary: string | null;
  completedAt: ISODate | null;
}

export interface CheckinReply {
  checkin: DailyCheckin;
  reply: string;
  done: boolean;
}

export interface CompanionNudge {
  id: string;
  text: string;
  status: 'scheduled' | 'sent' | 'dismissed' | 'cancelled';
  sentAt: ISODate | null;
  messages: CompanionMessage[];
}

export interface NudgeReply {
  nudge: CompanionNudge;
  reply: string;
}

export type TodayCheckinStatus = 'off' | 'upcoming' | 'due' | CheckinStatus;

export interface TodayBrief {
  date: string;
  languageStyle: LanguageStyle;
  greeting: string;
  headline: string;
  counts: { meetings: number; reminders: number; openItems: number };
  meetings: MeetingListItem[];
  reminders: Reminder[];
  openItems: ActionItem[];
  checkin: { time: string; status: TodayCheckinStatus; mood: number | null };
  nudge: CompanionNudge | null;
  /** Ids of today's meetings that overlap another one (double-booked). */
  overlapIds: string[];
}

export interface MoodPoint {
  date: string;
  mood: number | null;
  energy: number | null;
}

export interface WeeklyRecap {
  weekStart: string;
  weekEnd: string;
  headline: string;
  meetings: { count: number; hours: number; highlights: { id: string; title: string; startAt: ISODate }[] };
  promises: { kept: number; remindersDone: number; stillOpen: number };
  mood: { days: MoodPoint[]; average: number | null; trend: 'up' | 'down' | 'flat' | null; checkins: number };
  people: string[];
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
