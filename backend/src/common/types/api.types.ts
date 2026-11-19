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
  /** Daily rhythm, local "HH:MM" in the user's time zone. */
  wakeTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  checkinTime: string;
  /** When the user acknowledged the one-time "let people know when you record" note. */
  recordingConsentAt: ISODate | null;
  /** Push the morning brief at `wakeTime`. */
  morningBrief: boolean;
  /** Ask "how did today go?" at `checkinTime`. */
  eveningCheckin: boolean;
  /** Push important emails (user-flow §07). */
  emailAlerts: boolean;
  /** Senders (emails, lower case) that always alert, even in quiet hours. */
  vipSenders: string[];
  /** Senders the user marked "not important": never alert. */
  mutedSenders: string[];
  /** Normal pushes per local day before the rest are bundled into one (user-flow §09). */
  pushBudget: number;
  /** Critical alerts (timed reminders, meeting starting, urgent email) may break through quiet hours. */
  criticalBreakThrough: boolean;
  /** Focus mode: no pushes (critical ones wait too unless they may break through) until this time. */
  focusUntil: ISODate | null;
  /** "Take a break": no friend nudges (morning brief, check-in, nudges, follow-ups) until this time. */
  nudgesPausedUntil: ISODate | null;
}

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
  /** 1 polite and curious, 2 casual, 3 close friend (grows with warmth, updated nightly). */
  relationshipStage: number;
  updatedAt: ISODate | null;
}

export interface OnboardingChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OnboardingChatReply {
  reply: string;
  /** 0-based index of the question the reply asks; equals `totalSteps` once the chat is complete. */
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

// ---------- Meetings ----------
export const MEETING_STATUSES = [
  'scheduled',
  'joining',
  'waiting_room',
  'in_progress',
  'uploading',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'skipped',
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export type MeetingPlatform = 'google_meet' | 'zoom' | 'teams' | 'other' | 'in_person';
export type MeetingSource = 'calendar' | 'manual' | 'upload' | 'capture';
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
export type ReminderStatus = 'pending' | 'sent' | 'done' | 'cancelled' | 'failed';

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
  doneAt: ISODate | null;
  createdAt: ISODate;
}

// ---------- Notifications ----------
export type NotificationType =
  | 'meeting_upcoming'
  | 'report_ready'
  | 'action_item_due'
  | 'reminder'
  | 'daily_digest'
  | 'bot_failed'
  | 'broadcast'
  | 'welcome'
  | 'morning_brief'
  | 'evening_checkin'
  | 'reminder_followup'
  | 'companion_nudge'
  | 'weekly_recap'
  | 'capture_ready'
  | 'meeting_start'
  | 'meeting_notes'
  | 'email_important'
  | 'email_bundle'
  | 'task_created'
  | 'reconnect_needed'
  | 'push_bundle';

/** How notifications decide (user-flow §09). */
export type NotificationPriority = 'critical' | 'normal' | 'low';

// ---------- Tap to record a conversation (captures) ----------
/** A capture is a meeting with source `capture`: uploading → processing → completed | failed. */
export type CaptureStatus = 'uploading' | 'processing' | 'completed' | 'failed';
export type CaptureMood = 'happy' | 'calm' | 'neutral' | 'stressed' | 'low';

export interface CaptureBookmark {
  /** Offset from the start of the recording (paused time excluded). */
  atMs: number;
  label: string | null;
}

export interface CapturePerson {
  name: string;
  relation: string | null;
  notes: string[];
}

/** One way to answer an unclear reminder ("Rohit or Rahul?"): the reminder with that answer applied. */
export interface CaptureSuggestionOption {
  label: string;
  title: string;
  remindAt: ISODate | null;
}

/** A reminder the friend did not set because something was unclear; the user confirms or dismisses it. */
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
  /** Lasting facts about the user; added to the profile only when the user saves them in the review. */
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
  /** Unclear reminders still waiting for the user. */
  openSuggestionCount: number;
  reviewedAt: ISODate | null;
  failureReason: string | null;
  /** The recording had no usable speech (nothing to process). */
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
  /** Raw audio is still stored (only while uploading or after a failure, so it can be retried). */
  audioKept: boolean;
  /** The calendar event this recording belongs to. */
  linkedMeeting: MeetingRef | null;
  /** Calendar events around the recording time it may belong to (only when not linked). */
  eventSuggestions: MeetingRef[];
  /** Drafted recap email to the attendees (only for recordings linked to an event with attendees). */
  followUp: FollowUpDraft | null;
}

export interface MeetingRef {
  id: string;
  title: string;
  startAt: ISODate;
  endAt: ISODate | null;
}

/** Sent from the user's own email app after they approve it; never sent by the server. */
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
  /** Earlier meetings and recordings with these people, newest first. */
  lastDiscussed: { id: string; title: string; startAt: ISODate; summaryPreview: string | null; isCapture: boolean }[];
  /** Open to-dos from those conversations: what the user promised and what they promised. */
  promises: { mine: ActionItem[]; theirs: ActionItem[] };
  talkingPoints: string[];
  /** Other meetings overlapping this one (double-booked). */
  conflicts: MeetingRef[];
  /** A meeting starting within 15 minutes of this one ending (back-to-back). */
  nextUp: MeetingRef | null;
  /** A recording already linked to this meeting. */
  recordingId: string | null;
}

// ---------- Talk with your friend (user-flow §05) ----------
export type TalkIntent = 'vent' | 'advice' | 'recall' | 'task' | 'chat';

export type TalkAction =
  | {
      id: string;
      type: 'reminder';
      status: 'done' | 'failed';
      title: string;
      remindAt: ISODate | null;
      reminderId: string | null;
      note: string | null;
    }
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
  | {
      id: string;
      type: 'email';
      /** sent: from the user's mail app, or from their connected account when `sentFromAccount`. */
      status: 'proposed' | 'sent' | 'cancelled' | 'failed';
      to: string | null;
      subject: string;
      body: string;
      note: string | null;
      /** A reply to this email (threaded when sent from the connected account). */
      replyToEmailId?: string | null;
      /** The connected Gmail / Outlook can send it after approval. */
      canSendFromAccount?: boolean;
      sentFromAccount?: boolean;
    }
  | {
      id: string;
      type: 'task';
      /** done: added to the to-dos (or created in the tool); proposed: waits for Send; duplicate: merge or new. */
      status: 'done' | 'failed' | 'proposed' | 'duplicate';
      title: string;
      tool: string;
      actionItemId: string | null;
      note: string | null;
      details?: string | null;
      toolTaskId?: string | null;
      url?: string | null;
      externalKey?: string | null;
      duplicate?: ToolDuplicate | null;
    }
  | {
      id: string;
      type: 'email_summary';
      status: 'info';
      title: string;
      groups: { label: string; items: EmailItem[] }[];
      note: string | null;
    }
  | {
      id: string;
      type: 'tool_list';
      status: 'info';
      tool: ToolProvider;
      title: string;
      items: ToolItem[];
      note: string | null;
    }
  | {
      id: string;
      type: 'note';
      status: 'proposed' | 'saved' | 'cancelled' | 'failed';
      tool: 'notion';
      title: string;
      body: string;
      url: string | null;
      note: string | null;
    }
  | { id: string; type: 'pause'; status: 'done'; until: ISODate; note: string | null }
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
  /** null for an incognito chat (nothing is saved). */
  threadId: string | null;
  userMessage: TalkMessage;
  reply: TalkMessage;
}

// ---------- Daily rhythm: Today, evening check-in, proactive nudges, weekly recap ----------
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
  /** "light" after a missed check-in: no guilt, a softer ask. */
  tone: 'normal' | 'light';
  messages: CompanionMessage[];
  /** 1..5, extracted when the check-in wraps up. */
  mood: number | null;
  energy: number | null;
  wins: string[];
  summary: string | null;
  completedAt: ISODate | null;
}

export interface CheckinReply {
  checkin: DailyCheckin;
  reply: string;
  /** True when the friend wrapped up (tomorrow's plan included). */
  done: boolean;
}

export type NudgeStatus = 'scheduled' | 'sent' | 'dismissed' | 'cancelled';

export interface CompanionNudge {
  id: string;
  text: string;
  status: NudgeStatus;
  sentAt: ISODate | null;
  messages: CompanionMessage[];
}

export interface NudgeReply {
  nudge: CompanionNudge;
  reply: string;
}

export type TodayCheckinStatus = 'off' | 'upcoming' | 'due' | CheckinStatus;

export interface TodayBrief {
  /** Local date, YYYY-MM-DD. */
  date: string;
  languageStyle: LanguageStyle;
  /** "Good morning, Asha" in the user's vibe. */
  greeting: string;
  /** One line about the day ("3 meetings today, first at 10:00 AM."). */
  headline: string;
  counts: { meetings: number; reminders: number; openItems: number };
  /** Today's meetings (local day), earliest first. */
  meetings: MeetingListItem[];
  /** Today's reminders that still need the user (pending, or sent and not done). */
  reminders: Reminder[];
  /** Open to-dos and promises, soonest due first. */
  openItems: ActionItem[];
  checkin: { time: string; status: TodayCheckinStatus; mood: number | null };
  /** Today's proactive nudge, once sent and until dismissed. */
  nudge: CompanionNudge | null;
  /** Ids of today's meetings that overlap another one (double-booked). */
  overlapIds: string[];
  /** Emails that need the user and the FYI digest (user-flow §07). */
  emails: TodayEmails;
}

export interface MoodPoint {
  date: string;
  mood: number | null;
  energy: number | null;
}

export interface WeeklyRecap {
  /** Monday and Sunday of the week, YYYY-MM-DD. */
  weekStart: string;
  weekEnd: string;
  headline: string;
  meetings: { count: number; hours: number; highlights: { id: string; title: string; startAt: ISODate }[] };
  promises: { kept: number; remindersDone: number; stillOpen: number };
  mood: { days: MoodPoint[]; average: number | null; trend: 'up' | 'down' | 'flat' | null; checkins: number };
  people: string[];
  createdAt: ISODate;
}

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
export type EmailProvider = 'gmail' | 'outlook';
export type ToolProvider = 'notion' | 'jira' | 'linear' | 'todoist';
export type ConnectedProvider = EmailProvider | ToolProvider;
export type IntegrationProvider = 'google_calendar' | ConnectedProvider;

export interface IntegrationSettings {
  /** Email: the account may send replies the user approved (read + send), else read only. */
  canSend: boolean | null;
  /** Tools: default Notion database / Jira project / Linear team / Todoist project for new tasks. */
  targetId: string | null;
  targetName: string | null;
  /** Tools: create tasks without asking first. */
  autoSend: boolean;
}

export interface Integration {
  provider: IntegrationProvider;
  kind: 'calendar' | 'email' | 'tasks';
  /** False when the server has no OAuth client for it (shown as "coming soon"). */
  available: boolean;
  connected: boolean;
  status: 'connected' | 'needs_reconnect' | 'not_connected';
  /** Account email, or the workspace / site name for tools. */
  accountEmail: string | null;
  lastSyncedAt: ISODate | null;
  syncError: string | null;
  settings: IntegrationSettings | null;
}

export interface IntegrationTarget {
  id: string;
  name: string;
}

// ---------- Reading your email (user-flow §07) ----------
export type EmailCategory = 'urgent' | 'needs_reply' | 'fyi' | 'promotion' | 'phishing' | 'sensitive';
export type EmailStatus = 'new' | 'alerted' | 'held' | 'replied' | 'done' | 'dismissed';

export interface EmailDetected {
  id: string;
  kind: 'deadline' | 'bill' | 'booking' | 'travel';
  title: string;
  dueAt: ISODate | null;
  status: 'open' | 'added' | 'dismissed';
  reminderId: string | null;
}

export interface EmailItem {
  id: string;
  provider: EmailProvider;
  fromName: string | null;
  fromEmail: string | null;
  /** null for sensitive mail (codes, passwords, statements are never kept). */
  subject: string | null;
  /** One line: what it says or asks. */
  summary: string | null;
  /** Why it matters ("your manager needs it by 5 pm"). */
  why: string | null;
  category: EmailCategory;
  status: EmailStatus;
  receivedAt: ISODate;
  /** Deadlines, bills, bookings and travel still to confirm. */
  openDetected: number;
  isVip: boolean;
}

export interface EmailDetail extends EmailItem {
  detected: EmailDetected[];
  reminderId: string | null;
  /** The connected account can send the reply (read + send). */
  canSend: boolean;
  accountEmail: string | null;
  /** Opens the email in Gmail / Outlook on the web. */
  webUrl: string | null;
}

export interface EmailReplyDraft {
  to: string;
  subject: string;
  body: string;
  canSend: boolean;
}

export interface TodayEmails {
  connected: boolean;
  /** Urgent and needs-a-reply emails still open (last 3 days), newest first. */
  needYou: EmailItem[];
  needYouCount: number;
  /** FYI and newsletters bundled into the brief (last 24 hours). */
  fyi: EmailItem[];
  fyiCount: number;
}

// ---------- Notion, Jira and other tools (user-flow §08) ----------
export type ToolTaskStatus = 'pending' | 'open' | 'done' | 'failed';
export type ToolTaskSource = 'meeting' | 'email' | 'chat' | 'manual';

export interface ToolTask {
  id: string;
  provider: ToolProvider;
  title: string;
  /** JIRA-123, ENG-42 … when the tool has keys. */
  externalKey: string | null;
  url: string | null;
  status: ToolTaskStatus;
  source: ToolTaskSource;
  actionItemId: string | null;
  ownerName: string | null;
  dueAt: ISODate | null;
  lastError: string | null;
  createdAt: ISODate;
}

export interface ToolDuplicate {
  externalId: string;
  externalKey: string | null;
  title: string;
  url: string | null;
}

export interface ToolTaskResult {
  /**
   * created; duplicate (nothing created yet: merge or create new); linked (merged into the existing task);
   * queued (the tool is down or needs a reconnect: kept in the app and retried).
   */
  outcome: 'created' | 'duplicate' | 'linked' | 'queued';
  task: ToolTask | null;
  duplicate: ToolDuplicate | null;
}

/** An open item fetched from a tool ("what is pending on my Jira?"). */
export interface ToolItem {
  id: string;
  key: string | null;
  title: string;
  status: string | null;
  url: string | null;
  dueAt: ISODate | null;
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

export const QUEUE_NAMES = [
  'calendar-sync',
  'meeting-bot',
  'bot-events',
  'ai-processing',
  'notifications',
  'digest',
  'companion',
  'integrations',
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
