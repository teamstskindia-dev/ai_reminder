# Remi — API Contract (v1)

This document is the **single source of truth** between the backend and the three clients. Backend DTOs and
client types must match it exactly. If something here is ambiguous, prefer the simplest reading and keep
the JSON shapes identical.

- Base URL: `{API_URL}/api/v1` (dev: `http://localhost:4000/api/v1`)
- Swagger UI: `{API_URL}/docs`
- JSON bodies use **camelCase**. Timestamps are ISO-8601 strings in UTC (`2026-11-03T10:00:00.000Z`).
  Dates without a time are `YYYY-MM-DD`. Nullable fields are always present and set to `null` (never omitted).
- IDs are UUID strings.

---

## 0. Conventions

### Envelope

Every response (except redirects, `204`, and `GET /health`) is wrapped:

```ts
interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;          // present on paginated list endpoints
}

interface PaginationMeta {
  page: number;                   // 1-based
  limit: number;
  total: number;
  totalPages: number;
}

interface ApiError {
  success: false;
  statusCode: number;
  error: {
    code: ErrorCode;
    message: string;              // human readable, safe to show; never contains stack traces, SQL or provider internals
    details?: ValidationIssue[];  // only for VALIDATION_ERROR
  };
  path: string;
  timestamp: string;
  requestId: string;              // also returned as the `X-Request-Id` response header on every response
}

interface ValidationIssue {
  field: string;                  // dot path, e.g. "value.primaryColor" or "items.2.title"
  messages: string[];
}

type ErrorCode =
  | 'BAD_REQUEST' | 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'TOKEN_EXPIRED' | 'FORBIDDEN'
  | 'NOT_FOUND' | 'CONFLICT' | 'RATE_LIMITED' | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PLAN_LIMIT_REACHED' | 'UPSTREAM_ERROR' | 'MAINTENANCE' | 'INTERNAL_ERROR';
```

Status codes: `BAD_REQUEST` and `VALIDATION_ERROR` 400 · `UNAUTHORIZED` and `TOKEN_EXPIRED` 401 · `FORBIDDEN` and
`PLAN_LIMIT_REACHED` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 · `PAYLOAD_TOO_LARGE` 413 · `UNSUPPORTED_MEDIA_TYPE` 415 ·
`RATE_LIMITED` 429 · `INTERNAL_ERROR` 500 · `UPSTREAM_ERROR` 503 (Google, Gemini, Cloudinary or another dependency
failed; safe to retry; not 502, because Cloudflare replaces origin 502/504 responses with its own CORS-less page) ·
`MAINTENANCE` 503. Clients distinguish the two 503s by `error.code`.

Resources that exist but belong to another user return `404 NOT_FOUND`, never 403, so IDs cannot be enumerated.
Clients show `message` to the user, and show `requestId` as a "Reference" on unexpected errors (5xx) so support can
find the server log line.

### Pagination and list queries

`?page=1&limit=20` (max `limit` 100). Lists also accept `q` (search) and `sort` where noted
(`sort=startAt:desc`). Paginated responses return `data: T[]` plus `meta`.

### Authentication

| Client  | Mechanism                                                                                           |
|---------|-----------------------------------------------------------------------------------------------------|
| Website | httpOnly cookies `remi_at` (access) + `remi_rt` (refresh), set by the API. `fetch(..., { credentials: 'include' })`. |
| Admin   | httpOnly cookies `remi_admin_at` + `remi_admin_rt`. `credentials: 'include'`.                       |
| Mobile  | `Authorization: Bearer <accessToken>`; tokens kept in `expo-secure-store`.                           |

The API reads the access token from the `Authorization` header first and falls back to the cookie.
When the access token expires the API returns `401` with `error.code = 'TOKEN_EXPIRED'`; when no token is present it
returns `401` with `UNAUTHORIZED`. Cookie clients (web, admin) see `UNAUTHORIZED` after expiry, because the browser
drops the 15-minute access cookie, so **clients refresh on either code**: call the refresh endpoint once, then retry the
original request once. If the refresh fails, the client signs the user out. Never refresh in response to the refresh,
exchange, login or logout endpoints themselves, or to a retried request.
Clients must de-duplicate concurrent refreshes (one in-flight refresh promise).

Cookie attributes: `HttpOnly; SameSite=Lax; Path=/; Secure` (in production); `Domain=COOKIE_DOMAIN` when set.
Access cookie max-age is 15 min; refresh cookie max-age is 30 days.

### Maintenance mode

When `app.maintenanceMode` is true, every non-admin, non-public endpoint returns `503` with code `MAINTENANCE`.
`/public/*`, `/auth/*`, `/health` and `/admin/*` keep working.

### Rate limits

`429` with code `RATE_LIMITED` and a `Retry-After` header.

---

## 1. Shared types

```ts
type ISODate = string;

// ---------- Public config (dynamic branding / theme / flags) ----------
interface Branding {
  appName: string;                // "Remi"
  tagline: string;
  logoUrl: string;                // light background logo (Cloudinary URL)
  logoDarkUrl: string;            // logo for dark backgrounds
  iconUrl: string;                // square app icon / mark
  faviconUrl: string;
  supportEmail: string;
  companyName: string;
}

interface Theme {
  primaryColor: string;           // hex, e.g. "#5B4FE9"
  primaryForeground: string;      // text on primary
  accentColor: string;
  sidebarBackground: string;      // web app sidebar
  sidebarForeground: string;
  radius: number;                 // px, base corner radius
  fontFamily: string;             // Google font family name, e.g. "Inter"
  defaultMode: 'light' | 'dark' | 'system';
}

interface Features {
  askAi: boolean;
  analytics: boolean;
  reminders: boolean;
  actionItems: boolean;
  calendarSync: boolean;
  meetingUpload: boolean;
  pushNotifications: boolean;
  signupsEnabled: boolean;
}

interface AppMeta {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  minAppVersion: string;          // semver; mobile shows force-update below this
  latestAppVersion: string;
  androidStoreUrl: string;
  iosStoreUrl: string;
}

interface Seo {
  title: string;
  description: string;
  ogImageUrl: string;
  keywords: string[];
}

type NavLocation = 'header' | 'footer' | 'sidebar' | 'mobile_tab';

interface NavItem {
  id: string;
  label: string;
  href: string;                   // web: path or URL. mobile_tab: route name (see §Icons & routes)
  icon: IconKey | null;
  groupLabel: string | null;      // footer column
  isExternal: boolean;
  sortOrder: number;
}

interface Banner {
  id: string;
  placement: 'dashboard' | 'landing_top' | 'mobile_home';
  variant: 'info' | 'success' | 'warning' | 'promo';
  title: string;
  body: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

interface PublicConfig {
  branding: Branding;
  theme: Theme;
  features: Features;
  app: AppMeta;
  seo: Seo;
  navigation: Record<NavLocation, NavItem[]>;   // items already filtered by isActive + feature flags + platform
  banners: Banner[];                            // active now, for the requested platform
  version: string;                              // content hash; also sent as ETag
}

// ---------- CMS ----------
type SectionType =
  | 'hero' | 'logos' | 'features' | 'steps' | 'stats' | 'testimonials'
  | 'pricing' | 'faq' | 'cta' | 'rich_text' | 'onboarding_slide';

interface Section<T extends SectionType = SectionType> {
  id: string;
  page: string;                   // landing | pricing | login | mobile_onboarding | mobile_home
  type: T;
  content: SectionContent[T];
  sortOrder: number;
}

interface Cta { label: string; href: string }

interface SectionContent {
  hero:            { eyebrow: string | null; title: string; subtitle: string; primaryCta: Cta; secondaryCta: Cta | null; imageUrl: string | null; badges: string[] };
  logos:           { title: string; items: { name: string; imageUrl: string }[] };
  features:        { eyebrow: string | null; title: string; subtitle: string | null; items: { icon: IconKey; title: string; description: string; imageUrl: string | null }[] };
  steps:           { title: string; subtitle: string | null; items: { title: string; description: string }[] };
  stats:           { items: { value: string; label: string }[] };
  testimonials:    { title: string; items: { quote: string; name: string; role: string; avatarUrl: string | null }[] };
  pricing:         { title: string; subtitle: string | null };        // renders GET /public/plans
  faq:             { title: string; items: { question: string; answer: string }[] };
  cta:             { title: string; subtitle: string | null; cta: Cta };
  rich_text:       { markdown: string };
  onboarding_slide:{ title: string; description: string; imageUrl: string | null; backgroundColor: string | null };
}

interface CmsPage {
  id: string;
  slug: string;
  title: string;
  content: string;                // markdown
  seo: { title: string | null; description: string | null; ogImageUrl: string | null };
  status: 'draft' | 'published';
  publishedAt: ISODate | null;
  updatedAt: ISODate;
}

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  features: string[];
  limits: { meetingsPerMonth: number | null; aiQueriesPerDay: number | null; uploadMinutesPerMonth: number | null }; // null = unlimited
  ctaLabel: string | null;
  isPopular: boolean;
  isDefault: boolean;
  sortOrder: number;
}

// ---------- Users ----------
interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  timezone: string;               // IANA, e.g. "Asia/Kolkata"
  locale: string;
  status: 'active' | 'suspended';
  plan: Pick<Plan, 'id' | 'slug' | 'name'> | null;
  calendarConnected: boolean;
  onboardedAt: ISODate | null;
  createdAt: ISODate;
}

interface UserSettings {
  autoJoin: 'all' | 'owned' | 'none';   // which calendar meetings the bot joins
  botName: string | null;               // null → global bot name
  meetingReminderMinutes: number;       // 0 disables "meeting starting soon"
  dailyDigest: boolean;
  digestHour: number;                   // 0..23 in user's timezone
  emailNotifications: boolean;
  pushNotifications: boolean;
  wakeTime: string;                     // "HH:MM" (24h, user's timezone): morning brief
  quietHoursStart: string;              // "HH:MM"
  quietHoursEnd: string;                // "HH:MM"
  checkinTime: string;                  // "HH:MM": evening check-in
  recordingConsentAt: ISODate | null;   // when the one-time "let people know you record" note was acknowledged
  morningBrief: boolean;                // push the morning brief at wakeTime
  eveningCheckin: boolean;              // ask "how did today go?" at checkinTime
  emailAlerts: boolean;                 // push important emails (user-flow §07)
  vipSenders: string[];                 // always alert, even in quiet hours
  mutedSenders: string[];               // never alert
  pushBudget: number;                   // 1..50 normal pushes a day before the rest are bundled (default 8)
  criticalBreakThrough: boolean;        // critical alerts may break through quiet hours / focus mode
  focusUntil: ISODate | null;           // focus mode (PATCH: at most 24 h ahead, null = off)
  nudgesPausedUntil: ISODate | null;    // "take a break" (PATCH: at most 30 days ahead, null = resume)
  learningPaused: boolean;              // privacy (§10): memories are kept, nothing new is learned about the user
}

// The companion's personality profile, built by the first-run get-to-know-you chat.
interface UserProfile {
  status: 'pending' | 'completed' | 'skipped';
  preferredName: string | null;
  occupation: string | null;
  currentFocus: string | null;
  communicationStyle: string | null;    // e.g. "casual and funny"
  languageStyle: 'english' | 'hinglish' | 'mixed';
  tone: string | null;                  // e.g. "playful"
  facts: string[];
  summary: string | null;
  relationshipStage: number;            // 1 polite and curious, 2 casual, 3 close friend (grows nightly)
  updatedAt: ISODate | null;
}

interface OnboardingChatMessage { role: 'user' | 'assistant'; content: string }  // content 1..1000 chars

interface OnboardingChatReply {
  reply: string;
  step: number;                         // 0-based question index; equals totalSteps when done
  totalSteps: number;                   // 4
  done: boolean;
  languageStyle: 'english' | 'hinglish' | 'mixed';
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;              // access token lifetime, seconds
}

// ---------- Meetings ----------
type MeetingStatus =
  | 'scheduled' | 'joining' | 'waiting_room' | 'in_progress'
  | 'uploading'                       // captures only: parts are still being sent
  | 'processing' | 'completed' | 'failed' | 'cancelled' | 'skipped';

type MeetingPlatform = 'google_meet' | 'zoom' | 'teams' | 'other' | 'in_person';

interface Attendee { email: string; name: string | null; responseStatus: string | null; organizer: boolean }

interface ReportSummary {
  summaryPreview: string;         // first ~240 chars of summary
  meetingScore: number | null;    // 0..100
  engagementScore: number | null;
  sentimentScore: number | null;
  sentimentLabel: 'positive' | 'neutral' | 'negative' | null;
  topics: string[];
}

interface MeetingListItem {
  id: string;
  title: string;
  startAt: ISODate;
  endAt: ISODate | null;
  platform: MeetingPlatform;
  meetingUrl: string | null;
  status: MeetingStatus;
  source: 'calendar' | 'manual' | 'upload' | 'capture';   // capture = recorded in the app (see Captures)
  autoJoin: boolean;
  durationSeconds: number | null;
  organizerEmail: string | null;
  attendeeCount: number;
  actionItemCount: number;
  report: ReportSummary | null;
}

interface MeetingReport {
  summary: string;                // markdown allowed
  keyPoints: string[];
  chapters: { title: string; summary: string; startMs: number }[];
  keyQuestions: { question: string; answer: string | null; askedBy: string | null }[];
  decisions: string[];
  topics: string[];
  meetingScore: number | null;
  engagementScore: number | null;
  sentimentScore: number | null;
  sentimentLabel: 'positive' | 'neutral' | 'negative' | null;
  model: string | null;
  createdAt: ISODate;
}

interface Participant {
  id: string;
  name: string;
  email: string | null;
  talkTimeSeconds: number;
  wordCount: number;
  talkRatio: number;              // 0..100
}

interface MeetingDetail extends Omit<MeetingListItem, 'report'> {
  description: string | null;
  attendees: Attendee[];
  participants: Participant[];
  report: MeetingReport | null;
  actionItems: ActionItem[];
  botJoinedAt: ISODate | null;
  botLeftAt: ISODate | null;
  failureReason: string | null;
  recordingId: string | null;           // latest recording linked to this meeting (recorded on the phone)
}

interface TranscriptSegment {
  seq: number;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number | null;
}

// ---------- Action items & reminders ----------
interface ActionItem {
  id: string;
  meetingId: string | null;
  meetingTitle: string | null;
  title: string;
  description: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  isMine: boolean;
  dueAt: ISODate | null;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'done' | 'dismissed';
  source: 'ai' | 'manual';
  completedAt: ISODate | null;
  createdAt: ISODate;
}

type ReminderChannel = 'push' | 'in_app' | 'email';

interface Reminder {
  id: string;
  type: 'meeting_upcoming' | 'action_item_due' | 'commitment' | 'custom';
  title: string;
  body: string | null;
  remindAt: ISODate;
  channels: ReminderChannel[];
  status: 'pending' | 'sent' | 'done' | 'cancelled' | 'failed';
  source: 'ai' | 'manual' | 'system';
  meetingId: string | null;
  meetingTitle: string | null;
  actionItemId: string | null;
  sentAt: ISODate | null;
  doneAt: ISODate | null;               // when the user tapped Done
  createdAt: ISODate;
}

// ---------- Notifications ----------
type NotificationType =
  | 'meeting_upcoming' | 'report_ready' | 'action_item_due' | 'reminder'
  | 'daily_digest' | 'bot_failed' | 'broadcast' | 'welcome'
  | 'morning_brief' | 'evening_checkin' | 'reminder_followup' | 'companion_nudge' | 'weekly_recap'
  | 'capture_ready' | 'meeting_start' | 'meeting_notes'
  | 'email_important' | 'email_bundle' | 'task_created' | 'reconnect_needed' | 'push_bundle'
  | 'data_export_ready' | 'account_deleted';

interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: { meetingId?: string; actionItemId?: string; reminderId?: string; captureId?: string; url?: string; [k: string]: unknown };
  readAt: ISODate | null;
  createdAt: ISODate;
}

// ---------- Tap to record a conversation (user-flow §04) ----------
// A capture is a meeting with source 'capture' and platform 'in_person'.
type CaptureStatus = 'uploading' | 'processing' | 'completed' | 'failed';
type CaptureMood = 'happy' | 'calm' | 'neutral' | 'stressed' | 'low';

interface CaptureBookmark { atMs: number; label: string | null }        // offset, pauses excluded
interface CapturePerson { name: string; relation: string | null; notes: string[] }
interface CaptureSuggestionOption { label: string; title: string; remindAt: ISODate | null }

/** A reminder the friend did not set because something was unclear ("Rohit or Rahul?"). */
interface CaptureSuggestion {
  id: string;
  title: string;
  body: string | null;
  remindAt: ISODate | null;
  question: string;
  options: CaptureSuggestionOption[];   // each one is the reminder with that answer applied
  status: 'open' | 'confirmed' | 'dismissed';
  reminderId: string | null;            // set when confirmed
}

interface CaptureInsights {
  people: CapturePerson[];
  userFacts: string[];                  // proposed lasting facts about the user
  savedFacts: string[];                 // the ones the user chose to remember
  mood: CaptureMood | null;
  energy: number | null;                // 1..5
  suggestions: CaptureSuggestion[];
}

interface CaptureListItem {
  id: string;
  title: string;
  status: CaptureStatus;
  startAt: ISODate;
  durationSeconds: number | null;
  summaryPreview: string | null;
  actionItemCount: number;
  reminderCount: number;                // pending, sent or done
  openSuggestionCount: number;
  reviewedAt: ISODate | null;
  failureReason: string | null;
  noSpeech: boolean;                    // failed because there was no usable speech
  createdAt: ISODate;
}

interface CaptureDetail extends CaptureListItem {
  summary: string | null;
  keyPoints: string[];
  decisions: string[];
  bookmarks: CaptureBookmark[];
  actionItems: ActionItem[];
  reminders: Reminder[];
  insights: CaptureInsights | null;
  partsUploaded: number;
  audioKept: boolean;                   // only while uploading, or after a failure (to retry)
  linkedMeeting: MeetingRef | null;     // the calendar meeting it belongs to
  eventSuggestions: MeetingRef[];       // meetings around that time it may belong to (when not linked)
  followUp: FollowUpDraft | null;       // recap email draft for the attendees
}

interface MeetingRef { id: string; title: string; startAt: ISODate; endAt: ISODate | null }

/** Sent from the user's own email app after they approve it; never sent by the server. */
interface FollowUpDraft {
  to: { name: string | null; email: string }[];
  subject: string;
  body: string;
  status: 'draft' | 'sent' | 'skipped';
}

// ---------- Google Calendar and meetings (user-flow §06) ----------
interface MeetingPrep {
  meetingId: string;
  title: string;
  startAt: ISODate;
  endAt: ISODate | null;
  attendees: { name: string | null; email: string }[];
  lastDiscussed: { id: string; title: string; startAt: ISODate; summaryPreview: string | null; isCapture: boolean }[];
  promises: { mine: ActionItem[]; theirs: ActionItem[] };   // open to-dos from those conversations
  talkingPoints: string[];              // AI, cached for a few hours
  conflicts: MeetingRef[];              // double-booked
  nextUp: MeetingRef | null;            // starts within 15 min of this one ending
  recordingId: string | null;
}

// ---------- Talk with your friend (user-flow §05) ----------
type TalkIntent = 'vent' | 'advice' | 'recall' | 'task' | 'chat';

type TalkAction =
  | { id; type: 'reminder'; status: 'done' | 'failed'; title; remindAt; reminderId; note }
  | { id; type: 'meeting'; status: 'proposed' | 'scheduled' | 'cancelled' | 'needs_connection' | 'failed';
      title; startAt; endAt; attendees: { name; email | null }[]; eventId; note }
  | { id; type: 'email'; status: 'proposed' | 'sent' | 'cancelled' | 'failed'; to; subject; body; note;
      replyToEmailId?; canSendFromAccount?; sentFromAccount? }
  | { id; type: 'task'; status: 'done' | 'failed' | 'proposed' | 'duplicate'; title; tool; actionItemId; note;
      details?; toolTaskId?; url?; externalKey?; duplicate?: ToolDuplicate | null }
  | { id; type: 'email_summary'; status: 'info'; title; groups: { label; items: EmailItem[] }[]; note }
  | { id; type: 'tool_list'; status: 'info'; tool: ToolProvider; title; items: ToolItem[]; note }
  | { id; type: 'note'; status: 'proposed' | 'saved' | 'cancelled' | 'failed'; tool: 'notion'; title; body; url; note }
  | { id; type: 'pause'; status: 'done'; until: ISODate; note }
  | { id; type: 'unavailable'; status: 'info'; feature: 'email_read' | 'tool'; note };

interface TalkMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: AssistantSource[];           // memory the answer used (recordings and meetings)
  actions: TalkAction[];
  intent: TalkIntent | null;
  crisis: boolean;                      // the app shows helpline resources
  createdAt: ISODate;
}

interface TalkReply { threadId: string | null; userMessage: TalkMessage; reply: TalkMessage }  // threadId null = incognito

// ---------- Daily rhythm (user-flow §03) ----------
interface CompanionMessage { role: 'user' | 'assistant'; content: string; at: ISODate }

interface DailyCheckin {
  id: string;
  date: string;                         // local YYYY-MM-DD
  status: 'prompted' | 'replied' | 'completed' | 'missed';
  tone: 'normal' | 'light';             // light after a missed check-in (no guilt)
  messages: CompanionMessage[];
  mood: number | null;                  // 1..5, set at wrap-up
  energy: number | null;                // 1..5
  wins: string[];
  summary: string | null;
  completedAt: ISODate | null;
}

interface CheckinReply { checkin: DailyCheckin; reply: string; done: boolean }  // done: wrapped up with tomorrow's plan

interface CompanionNudge {
  id: string;
  text: string;
  status: 'scheduled' | 'sent' | 'dismissed' | 'cancelled';
  sentAt: ISODate | null;
  messages: CompanionMessage[];
}

interface NudgeReply { nudge: CompanionNudge; reply: string }

interface TodayBrief {
  date: string;                         // local YYYY-MM-DD
  languageStyle: 'english' | 'hinglish' | 'mixed';
  greeting: string;                     // "Good morning, Asha"
  headline: string;                     // "3 meetings today (first at 10:00 AM), 2 reminders and 4 open to-dos."
  counts: { meetings: number; reminders: number; openItems: number };
  meetings: MeetingListItem[];          // today's (local day)
  reminders: Reminder[];                // today's, pending or sent and not done
  openItems: ActionItem[];              // open to-dos and promises, soonest due first (max 5)
  checkin: { time: string; status: 'off' | 'upcoming' | 'due' | DailyCheckin['status']; mood: number | null };
  nudge: CompanionNudge | null;         // today's nudge once sent, until dismissed
  overlapIds: string[];                 // today's meetings that overlap another one (double-booked)
  emails: TodayEmails;                  // what needs the user + the FYI digest (user-flow §07)
}

interface MoodPoint { date: string; mood: number | null; energy: number | null }

interface WeeklyRecap {
  weekStart: string;                    // Monday, YYYY-MM-DD
  weekEnd: string;                      // Sunday
  headline: string;
  meetings: { count: number; hours: number; highlights: { id: string; title: string; startAt: ISODate }[] };
  promises: { kept: number; remindersDone: number; stillOpen: number };
  mood: { days: MoodPoint[]; average: number | null; trend: 'up' | 'down' | 'flat' | null; checkins: number };
  people: string[];
  createdAt: ISODate;
}

// ---------- Ask AI ----------
interface AssistantSource {
  meetingId: string;
  meetingTitle: string;
  startAt: ISODate;
  snippet: string;
  similarity: number;
}

interface AssistantThread { id: string; title: string; createdAt: ISODate; updatedAt: ISODate }

interface AssistantMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;                // markdown
  sources: AssistantSource[];
  createdAt: ISODate;
}

// ---------- Dashboard / analytics ----------
interface DashboardHome {
  stats: {
    meetingsThisWeek: number;
    hoursThisWeek: number;        // one decimal
    openActionItems: number;
    pendingReminders: number;
    avgMeetingScore: number | null;
  };
  upcomingMeetings: MeetingListItem[];   // next 5 (status scheduled/joining/waiting_room/in_progress)
  recentReports: MeetingListItem[];      // last 5 completed
  openActionItems: ActionItem[];         // 5, due soonest first
  upcomingReminders: Reminder[];         // next 5 pending
  banners: Banner[];                     // placement=dashboard (web) or mobile_home (mobile), by ?platform=
}

interface AnalyticsOverview {
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
  byDay: { date: string; meetings: number; minutes: number; avgScore: number | null }[];  // one entry per day in range, zero-filled
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  topTopics: { topic: string; count: number }[];                      // max 10
  topParticipants: { name: string; meetings: number; talkTimeSeconds: number }[];  // max 10
  byHourOfDay: { hour: number; meetings: number }[];                  // 0..23 in user tz, zero-filled
}

// ---------- Integrations / devices ----------
type EmailProvider = 'gmail' | 'outlook';
type ToolProvider = 'notion' | 'jira' | 'linear' | 'todoist';

interface Integration {
  provider: 'google_calendar' | EmailProvider | ToolProvider;
  kind: 'calendar' | 'email' | 'tasks';
  available: boolean;                   // false: no OAuth client on the server yet ("coming soon")
  connected: boolean;
  status: 'connected' | 'needs_reconnect' | 'not_connected';
  accountEmail: string | null;          // or the workspace / site name for tools
  lastSyncedAt: ISODate | null;
  syncError: string | null;
  settings: { canSend: boolean | null; targetId: string | null; targetName: string | null; autoSend: boolean } | null;
}

interface IntegrationTarget { id: string; name: string }

// ---------- Email (user-flow §07) ----------
type EmailCategory = 'urgent' | 'needs_reply' | 'fyi' | 'promotion' | 'phishing' | 'sensitive';

interface EmailItem {
  id: string;
  provider: EmailProvider;
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;               // null for sensitive mail (never kept)
  summary: string | null;               // one line: what it says or asks
  why: string | null;                   // why it matters
  category: EmailCategory;
  status: 'new' | 'alerted' | 'held' | 'replied' | 'done' | 'dismissed';
  receivedAt: ISODate;
  openDetected: number;                 // deadlines, bills, bookings, travel still to confirm
  isVip: boolean;
}

interface EmailDetail extends EmailItem {
  detected: { id: string; kind: 'deadline' | 'bill' | 'booking' | 'travel'; title: string; dueAt: ISODate | null;
              status: 'open' | 'added' | 'dismissed'; reminderId: string | null }[];
  reminderId: string | null;
  canSend: boolean;                     // read + send connection
  accountEmail: string | null;
  webUrl: string | null;                // open in Gmail / Outlook on the web
}

interface EmailReplyDraft { to: string; subject: string; body: string; canSend: boolean }

interface TodayEmails { connected: boolean; needYou: EmailItem[]; needYouCount: number; fyi: EmailItem[]; fyiCount: number }

// ---------- Tools (user-flow §08) ----------
interface ToolTask {
  id: string;
  provider: ToolProvider;
  title: string;
  externalKey: string | null;           // JIRA-123
  url: string | null;
  status: 'pending' | 'open' | 'done' | 'failed';
  source: 'meeting' | 'email' | 'chat' | 'manual';
  actionItemId: string | null;
  ownerName: string | null;
  dueAt: ISODate | null;
  lastError: string | null;
  createdAt: ISODate;
}

interface ToolDuplicate { externalId: string; externalKey: string | null; title: string; url: string | null }
interface ToolTaskResult { outcome: 'created' | 'duplicate' | 'linked' | 'queued'; task: ToolTask | null; duplicate: ToolDuplicate | null }
interface ToolItem { id: string; key: string | null; title: string; status: string | null; url: string | null; dueAt: ISODate | null }

interface Device {
  id: string;
  platform: 'android' | 'ios' | 'web';
  deviceName: string | null;
  appVersion: string | null;
  lastSeenAt: ISODate;
}
```

### Icons and routes

Icon keys are stable strings the clients map to their own icon set (web: lucide-react, mobile: lucide-react-native).
Unknown keys must fall back to a generic icon.

```ts
type IconKey =
  | 'home' | 'calendar' | 'meetings' | 'reports' | 'analytics' | 'action-items' | 'reminders'
  | 'ask-ai' | 'notifications' | 'settings' | 'profile' | 'help' | 'sparkles' | 'mic'
  | 'shield' | 'zap' | 'clock' | 'search' | 'mail' | 'globe' | 'users' | 'file-text' | 'bell' | 'check'
  | 'memory';
```

Web sidebar `href`s are app paths: `/dashboard`, `/analytics/reports`, `/analytics/overview`, `/calendar`,
`/action-items`, `/reminders`, `/ask`, `/settings`.
Mobile tab `href`s are expo-router tab names: `home`, `meetings`, `reminders`, `ask`, `memory`, `profile`.
The mobile app shows only tabs present in `navigation.mobile_tab` (in that order) and uses each `label`. The default
set (user-flow §10) is Today (`home`), Talk (`ask`), Memory (`memory`) and You (`profile`); Meetings and Reminders stay
reachable from Today and can be shown again from the admin panel.

---

## 2. Public endpoints (no auth)

| Method | Path | Query / Body | Response `data` |
|--------|------|--------------|-----------------|
| GET | `/health` | — | `{ status: 'ok', uptime: number }` (no envelope) |
| GET | `/health/ready` | — | `{ status: 'ok' \| 'degraded', checks: { redis: boolean, database: boolean } }` (no envelope) |
| GET | `/public/config` | `platform=web\|mobile` | `PublicConfig`. Supports `If-None-Match` → `304`. |
| GET | `/public/sections` | `page=landing`, `platform=web\|mobile` | `Section[]` sorted by `sortOrder` |
| GET | `/public/pages/:slug` | — | `CmsPage` (published only, else 404) |
| GET | `/public/plans` | — | `Plan[]` (active, sorted) |

---

## 3. User auth

| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | `/auth/google` | `platform=web\|mobile`; mobile also requires `redirectUri` (must match the allowlist) and `codeChallenge` (PKCE S256, base64url, 43–128 chars) | `302` → Google consent |
| GET | `/auth/google/callback` | `code`, `state` (from Google) | `302` → web: `{WEB_URL}/auth/callback?code=<otc>`; mobile: `{redirectUri}?code=<otc>`. On failure the same target with `?error=<code>` (`access_denied`, `account_suspended`, `signups_disabled`, `oauth_failed`). |
| POST | `/auth/exchange` | `{ code: string; codeVerifier?: string }` — `codeVerifier` is required when the flow started with `platform=mobile`; the API checks `base64url(sha256(codeVerifier)) === codeChallenge` and rejects with `400 BAD_REQUEST` otherwise | `{ user: User; tokens: AuthTokens; isNewUser: boolean }`. Also sets the web cookies (web flow only). |

**Mobile PKCE (RFC 8252/7636).** Custom URL schemes (`remi://`) can be claimed by other apps, so the one-time code
alone is not enough on mobile. The app generates a random `codeVerifier` (32 random bytes, base64url), sends
`codeChallenge = base64url(sha256(codeVerifier))` to `/auth/google`, keeps the verifier in memory, and sends it with
`/auth/exchange`. The API carries the challenge inside the signed `state`, stores it with the one-time code (Redis, 60 s,
single use) and verifies it at exchange. A failed verification consumes the code, and the API logs it as a security event.
| POST | `/auth/apple` | `{ identityToken: string; givenName?: string; familyName?: string }` (iOS Sign in with Apple; Apple sends the name only the first time) | `{ user: User; tokens: AuthTokens; isNewUser: boolean }`. The token is verified against Apple's keys (issuer, audience in `APPLE_CLIENT_IDS`, expiry). Links to an existing account by Apple id, or by email when Apple marks it verified. |
| POST | `/auth/email/start` | `{ email: string }` | `204`. Emails a 6-digit code (10 min, single use, max 5 per address per hour). Without SMTP outside production the code is printed in the API log. `429 RATE_LIMITED` when too many codes were requested. |
| POST | `/auth/email/verify` | `{ email: string; code: string }` (6 digits) | `{ user: User; tokens: AuthTokens; isNewUser: boolean }`. Creates the account on first sign-in (unless sign-ups are paused → `403`). 5 wrong attempts invalidate the code (`401`). |
| POST | `/auth/refresh` | `{ refreshToken?: string }` (mobile sends body; web relies on the `remi_rt` cookie) | `{ tokens: AuthTokens }` (+ rotated cookies) |
| POST | `/auth/logout` | `{ refreshToken?: string }` | `204`; revokes the session and clears cookies |
| GET | `/auth/me` | — | `{ user: User; settings: UserSettings }` |

After the first web login, the website redirects to `/analytics/reports?action=welcomeCalendarSuccess` when
`isNewUser` is true (shows a welcome dialog), otherwise to `/dashboard`.

---

## 4. User endpoints (auth required)

### Profile and settings

| Method | Path | Body | Response `data` |
|--------|------|------|-----------------|
| GET | `/me` | — | `User` |
| PATCH | `/me` | `{ name?: string; timezone?: string; locale?: string; onboarded?: true }` (mobile uses `POST /onboarding/complete` instead of `onboarded`) | `User` |
| DELETE | `/me` | — | `204` (deletes account and all data, revokes Google token) |
| GET | `/me/settings` | — | `UserSettings` |
| PATCH | `/me/settings` | `Partial<UserSettings>` without `recordingConsentAt`, plus `recordingConsentAcknowledged?: true` (stamps `recordingConsentAt` once). Times are `"HH:MM"` 24h. | `UserSettings` |
| GET | `/me/profile` | — | `UserProfile` (`status: 'pending'` with empty fields until the chat runs) |
| PATCH | `/me/profile` | `ProfilePatch`: any of `preferredName`, `occupation`, `currentFocus`, `communicationStyle`, `tone` (string or `null` to clear), `languageStyle`, `facts` (the whole list, max 50 × 200 chars) | `UserProfile` ("what I know about you": edit, correct or delete any item) |
| DELETE | `/me/profile` | — | `204` (forgets the personality profile) |
| GET | `/me/export` | — | `DataExportStatus` |
| POST | `/me/export` | — | `DataExportStatus` (`preparing`). The worker builds one JSON file with everything the friend remembers (no tokens or secrets), emails `data_export_ready` with the link and adds it in-app. 3 per hour. |
| GET | `/exports/:token` | Public | The export file (attachment, no envelope). The token is long and random; the link works for 3 days. |

Deleting the account (`DELETE /me`) also removes a pending export and sends the `account_deleted` email after the data is gone.

### Onboarding (first run)

The mobile app runs these after sign-in while `user.onboardedAt` is `null` (connect Calendar → get-to-know-you chat →
mic → notifications → daily rhythm → recording note → first nudge). Every AI step has a scripted fallback, so
onboarding never blocks on the AI.

| Method | Path | Body | Response `data` |
|--------|------|------|-----------------|
| POST | `/onboarding/chat` | `{ messages: OnboardingChatMessage[] }` (max 12; empty → opening message) | `OnboardingChatReply`. Four questions (name, what you do, what's on your mind, how to talk to you); replies mirror English/Hinglish. 30/min per user. |
| POST | `/onboarding/profile` | `{ messages: OnboardingChatMessage[] }` | `UserProfile` (no user answers → `status: 'skipped'`). 5/min per user. |
| POST | `/onboarding/transcribe` | multipart `file` (audio, ≤ 15 MB) | `{ text: string }` (Hindi words in Latin script; empty when no speech). Audio is not stored. 10/min per user. |
| POST | `/onboarding/complete` | — | `User` with `onboardedAt` set (idempotent). Marks an unfinished profile `skipped` and sends the `welcome` notification (email + in-app) the first time. |

### Integrations

| Method | Path | Response `data` |
|--------|------|-----------------|
| GET | `/integrations` | `Integration[]`: Google Calendar, Gmail, Outlook, Notion, Jira, Linear, Todoist (`available: false` = no OAuth client on the server yet) |
| POST | `/integrations/google-calendar/sync` | `{ queued: true }` |
| DELETE | `/integrations/google-calendar` | `204` (revokes token, stops sync, cancels scheduled bots) |
| GET | `/integrations/:provider/connect?redirectUri=&mode=read\|send` | `{ url }`: consent URL for `gmail`, `outlook`, `notion`, `jira`, `linear`, `todoist` (`redirectUri` must be in the mobile allowlist; `mode` is for email only, default `send`) |
| GET | `/integrations/oauth/callback` | Public. The provider redirects here; the API exchanges the code and redirects to `redirectUri?provider=…&status=connected` or `&error=access_denied\|connect_failed` |
| PATCH | `/integrations/:provider` | `{ targetId?; targetName?; autoSend? }` (tools: default project / database and "send without asking") → `Integration` |
| DELETE | `/integrations/:provider` | `204` (stored tokens are deleted; Gmail is not revoked at Google because it shares the sign-in grant; emails read from it are deleted, tasks stay as to-dos) |

To reconnect Google Calendar, the client restarts the `/auth/google` flow. Connected apps keep their tokens encrypted (AES-256-GCM); an expired or revoked grant sets `status: 'needs_reconnect'` and sends one `reconnect_needed` notification a day (push + in-app, `data.url = '/connected-apps'`).

### Email (user-flow §07)

| Method | Path | Query / Body | Response `data` |
|--------|------|--------------|-----------------|
| GET | `/emails` | `filter=important\|needs_reply\|fyi\|all` (default `all`, which hides promotions), `page`, `limit` | `EmailItem[]` + `meta` |
| POST | `/emails/sync` | — (check the inbox now) | `{ queued: true }` |
| GET | `/emails/:id` | — | `EmailDetail` |
| POST | `/emails/:id/feedback` | `{ kind: 'not_important' \| 'always_alert' }` (mutes the sender / makes them a VIP) | `EmailDetail` |
| POST | `/emails/:id/status` | `{ status: 'done' \| 'new' }` | `EmailDetail` |
| POST | `/emails/:id/remind` | `{ remindAt; title? }` (remind me later) | `EmailDetail` |
| POST | `/emails/:id/detected/:detectedId` | `{ action: 'reminder' \| 'calendar' \| 'dismiss'; remindAt? }` (a deadline, bill, booking or trip the email mentions; reminder defaults to a day before it is due) | `EmailDetail` |
| POST | `/emails/:id/reply-draft` | `{ instructions? }` (drafts in the user's style; nothing is sent; 20/min) | `EmailReplyDraft` |
| POST | `/emails/:id/reply` | `{ to; subject; body }` (sends the approved reply from the user's own account, threaded; needs `canSend`; 10/min) | `EmailDetail` |

The worker polls each connected inbox every `EMAIL_POLL_INTERVAL_MINUTES` (Gmail history / Graph inbox). New emails are sorted by rules first (OTPs, passwords and statements → `sensitive`, kept with no subject or summary; muted senders → `fyi`; promotions tab → `promotion`) and then by the AI (`email_triage` prompt): `urgent`, `needs_reply`, `fyi`, `promotion` or `phishing`, a one-line `summary`, `why` it matters and `detected` deadlines / bills / bookings / travel. Email bodies are never stored; rows are deleted after 30 days. Urgent mail and VIP senders get `email_important` (critical: held in quiet hours unless the sender is a VIP or critical alerts may break through; `data.emailId`, opens `/email/:id`), at most 3 an hour; the rest of an inbox flood comes as one `email_bundle`. The first sync of an account reads the last day but never alerts. `TodayBrief.emails` lists what needs the user (last 3 days) and the FYI digest (last day); the morning brief headline and the daily email digest include them.

### Tools: Notion, Jira, Linear, Todoist (user-flow §08)

| Method | Path | Query / Body | Response `data` |
|--------|------|--------------|-----------------|
| GET | `/tools/tasks` | `actionItemId?` | `ToolTask[]` (newest first) |
| POST | `/tools/tasks` | `{ provider?; actionItemId?; title?; details?; dueAt?; ownerName?; source?: 'meeting' \| 'email' \| 'chat' \| 'manual'; force?; mergeWithExternalId? }` (30/min) | `ToolTaskResult` |
| GET | `/tools/:provider/targets` | — | `IntegrationTarget[]` (Notion databases shared with the app, Jira projects, Linear teams, Todoist projects) |

`POST /tools/tasks` only after the user tapped Send (or turned auto-send on). It creates the to-do in the app when there is none (the linked copy), picks the default project (the first one when none was chosen), and first looks for a similar open task: `outcome: 'duplicate'` creates nothing; call again with `mergeWithExternalId` (link) or `force: true` (create anyway). A tool that is down or needs a reconnect returns `outcome: 'queued'`: the task stays in the app (`status: 'pending'`) and is retried with backoff. An owner who is not the user is assigned when the name is unambiguous (Jira, Linear), otherwise named in the task. `task_created` (push + in-app, `data.url` = the task in the tool). Every 15 minutes the worker reads open tasks back: done there marks the to-do done here; a changed due date moves its reminder.

### Dashboard and analytics

| Method | Path | Query | Response `data` |
|--------|------|-------|-----------------|
| GET | `/dashboard/home` | `platform=web\|mobile` | `DashboardHome` |
| GET | `/analytics/overview` | `range=7d\|30d\|90d` (default `30d`) or `from`,`to` | `AnalyticsOverview` |

### Meetings

| Method | Path | Query / Body | Response `data` |
|--------|------|--------------|-----------------|
| GET | `/meetings` | `scope=upcoming\|past\|all` (default `all`), `status?`, `q?`, `from?`, `to?`, `page`, `limit`, `sort?` (`startAt:asc\|desc`; upcoming defaults to asc, others desc) | `MeetingListItem[]` + `meta` |
| GET | `/meetings/:id` | — | `MeetingDetail` |
| GET | `/meetings/:id/transcript` | — | `TranscriptSegment[]` |
| GET | `/meetings/:id/prep` | — (pre-meeting brief) | `MeetingPrep` |
| POST | `/meetings` | `{ title: string; meetingUrl: string; startAt: ISODate; endAt?: ISODate; autoJoin?: boolean }` (manual add; Meet URL validated) | `MeetingDetail` |
| PATCH | `/meetings/:id` | `{ title?: string; autoJoin?: boolean }` | `MeetingDetail` |
| DELETE | `/meetings/:id` | — | `204` |
| POST | `/meetings/:id/bot/join` | — (send the bot now; meeting must have a URL and not be finished) | `MeetingDetail` |
| POST | `/meetings/:id/bot/leave` | — | `MeetingDetail` |
| POST | `/meetings/:id/reprocess` | — | `{ queued: true }` |
| POST | `/meetings/upload` | `multipart/form-data`: `file` (audio ≤ 200 MB: mp3, m4a, wav, webm, ogg; or transcript ≤ 5 MB: txt, vtt, srt), `title`, `startAt?` | `MeetingDetail` (status `processing`) |

### Captures (tap to record a conversation)

| Method | Path | Query / Body | Response `data` |
|--------|------|--------------|-----------------|
| GET | `/captures` | `limit=1..50` (default 10) | `CaptureListItem[]` (newest first) |
| POST | `/captures` | `{ clientId: uuid; startedAt: ISODate; title? }` (idempotent on `clientId`; status `uploading`) | `CaptureDetail` |
| PUT | `/captures/:id/parts/:index` | `multipart/form-data`: `file` (audio ≤ 50 MB), `durationMs`. The same index again replaces it (120/min) | `{ index; partsUploaded }` |
| POST | `/captures/:id/finish` | `{ partCount; durationMs; title?; bookmarks?: CaptureBookmark[] }` (parts 0..partCount-1 must all be in; at least 1.5 s; safe to repeat) | `CaptureDetail` (status `processing`) |
| GET | `/captures/:id` | — | `CaptureDetail` |
| PATCH | `/captures/:id` | `{ title?; linkedMeetingId?: uuid \| null }` (linking copies the attendees and drafts a follow-up) | `CaptureDetail` |
| POST | `/captures/:id/follow-up` | `{ status: 'sent' \| 'skipped'; subject?; body? }` (the app sent it from the user's email app) | `CaptureDetail` |
| POST | `/captures/:id/review` | `{ suggestions?: { id; action: 'confirm' \| 'dismiss'; title?; remindAt? }[]; saveFacts?: string[] }` (confirmed reminders are scheduled; facts go to the profile; marks it reviewed) | `CaptureDetail` |
| POST | `/captures/:id/retry` | — (only failed with the audio kept, not `noSpeech`) | `CaptureDetail` |
| DELETE | `/captures/:id` | — (removes audio, transcript, summary and to-dos; cancels pending reminders) | `204` |

The app records in parts of about 5 minutes (a crash loses at most the current part) and keeps them on the phone until `finish` succeeds, so recording works offline. Processing transcribes each part (English and Hinglish, speakers), joins them, writes the summary, to-dos and reminders, then extracts people, facts about the user and mood. Clear reminders are scheduled; a reminder whose person, day or time is unclear (or missing) becomes a `CaptureSuggestion` instead. When done the user gets `capture_ready` (push + in-app, `data.captureId`, opens `/capture/:id`) and the raw audio is deleted; after a failure the audio is kept for `retry`. Unreviewed suggestions from the day are mentioned in the evening check-in. Captures also appear in `/meetings` (source `capture`) and feed Ask AI. `POST /captures` also takes `meetingId` (the calendar meeting it belongs to: "Meeting starting: record it?" and quick notes); a recording linked to a meeting with attendees gets a drafted follow-up email.

### Calendar and meetings (user-flow §06)

- Google sign-in asks for `calendar.events` (read and write). Accounts connected earlier with `calendar.events.readonly` keep syncing; scheduling asks them to reconnect.
- When Gmail is enabled, the same Google sign-in also asks for `gmail.readonly` and `gmail.send`. If the user grants them, Gmail is connected with those tokens (no separate connect step). An existing Gmail connection is never replaced. If the user unticks Gmail, they can connect it later from Connected apps.
- Sync now keeps every timed event, including in-person ones without a video link (`platform: 'in_person'`, no `meetingUrl`); all-day events are skipped.
- **Pre-meeting brief**: the `meeting_upcoming` push now goes `meetingReminderMinutes` before (default **30**) with a prep line (who is coming, a double-booking warning, and for back-to-back meetings the next one too, whose own brief is then folded into this one). It opens the meeting, which shows `GET /meetings/:id/prep`.
- **Meeting starting: record it?** (`meeting_start`) at the start time, unless the notetaker bot joins or it is already being recorded; **Add quick notes?** (`meeting_notes`) 2 minutes after the end when nothing was recorded (not in quiet hours). Both carry `data.url` = `/capture/record?meetingId=…` (`&mode=notes`). Rescheduling moves them; cancelling removes them.
- `TodayBrief.overlapIds` and the brief headline flag double-booked meetings.

### Talk (user-flow §05)

| Method | Path | Query / Body | Response `data` |
|--------|------|--------------|-----------------|
| POST | `/talk/messages` | `{ text; threadId?; incognito?: boolean; history?: { role; content }[] }` (`history` only for incognito; 20/min; shares the plan's daily AI quota with Ask AI) | `TalkReply` |
| POST | `/talk/schedule` | `{ messageId?; actionId?; title; startAt; endAt; attendees: { name?; email }[] }` (after the user approved a meeting proposal; Google sends the invites) | `{ eventId; htmlLink; message: TalkMessage \| null }` |
| POST | `/talk/actions/status` | `{ messageId; actionId; status: 'sent' \| 'cancelled' }` (email sent from the user's mail app, or a proposal dropped) | `TalkMessage` |
| POST | `/talk/actions/email` | `{ messageId?; actionId?; to; subject; body; replyToEmailId? }` (approved draft sent from the connected Gmail / Outlook; threaded when a reply) | `{ message: TalkMessage \| null }` |
| POST | `/talk/actions/task` | `{ messageId; actionId; mode: 'send' \| 'merge' \| 'new' }` (a prepared task for a tool; after a duplicate warning: merge or create new) | `TalkMessage` |
| POST | `/talk/actions/note` | `{ messageId; actionId; title; body }` (approved note saved to the default Notion database) | `TalkMessage` |
| GET | `/talk/threads` | `page`, `limit` | `{ id; title; createdAt; updatedAt }[]` + `meta` |
| GET | `/talk/threads/:id/messages` | — | `TalkMessage[]` (oldest first) |
| DELETE | `/talk/threads/:id` | — | `204` |

Each message searches memory (pgvector over recordings and meetings), then the friend answers in the user's language style and relationship stage. It works out the intent (vent, advice, recall, task, chat). Reminders are set right away; things that affect others are only proposed: a meeting gets a free slot from the synced calendar and the guest's email from past meetings, then waits for approval; an email draft opens in the user's own mail app. With Gmail / Outlook connected it summarises the inbox ("summarize my mails today": important, needs a reply, FYI), searches it ("anything from HDFC this week?") and drafts replies to the latest email from someone, sent from the user's account only after Send (`/talk/actions/email`); read-only accounts open the draft in the mail app. Tasks for a connected tool come back as a preview (`task`, `status: 'proposed'`) unless auto-send is on; "what is pending on my Jira?" or "prep me for sprint review" returns a `tool_list` with the open items and an answer that combines them with memory; "save this to Notion" returns a `note` to approve; "give me a break for 3 days" pauses nudges (`pause`). Unconnected tools fall back to an in-app to-do. The reply is rewritten when an action did not do what the model said (it never claims "scheduled" for a proposal). New lasting facts go to the profile. Incognito saves and learns nothing. Signs of crisis set `crisis` and the reply shares Tele-MANAS (14416). Talk threads are `kind: 'talk'` and are not listed by Ask AI.

### Action items

| Method | Path | Query / Body | Response `data` |
|--------|------|--------------|-----------------|
| GET | `/action-items` | `status=open\|done\|dismissed\|all` (default `open`), `meetingId?`, `mine?=true`, `page`, `limit` | `ActionItem[]` + `meta` |
| POST | `/action-items` | `{ title; description?; dueAt?; priority?; meetingId?; remind?: boolean }` (`remind` creates an `action_item_due` reminder at `dueAt`) | `ActionItem` |
| PATCH | `/action-items/:id` | `{ title?; description?; dueAt?; priority?; status? }` | `ActionItem` |
| DELETE | `/action-items/:id` | — | `204` |

### Reminders

| Method | Path | Query / Body | Response `data` |
|--------|------|--------------|-----------------|
| GET | `/reminders` | `status=pending\|sent\|done\|cancelled\|all` (default `pending`), `from?`, `to?`, `page`, `limit` | `Reminder[]` + `meta` (sorted by `remindAt` asc) |
| GET | `/reminders/:id` | — | `Reminder` |
| POST | `/reminders` | `{ title; body?; remindAt; channels?: ReminderChannel[]; meetingId?; actionItemId? }` (`remindAt` must be in the future) | `Reminder` |
| PATCH | `/reminders/:id` | `{ title?; body?; remindAt?; channels?; status?: 'cancelled' }` | `Reminder` |
| DELETE | `/reminders/:id` | — | `204` |
| POST | `/reminders/:id/snooze` | `{ minutes: number }` (5..1440) | `Reminder` |
| POST | `/reminders/:id/done` | — (stops it, no follow-up; marks a linked action item done; idempotent) | `Reminder` |

A fired reminder that is neither done nor snoozed gets **one** gentle follow-up push (`reminder_followup`) 2 hours later, unless that falls in quiet hours or the user is taking a break. The same reminder from two sources (a recording and a chat, an email and a manual one) within an hour is merged into one. Reminder pushes carry `categoryId: "reminder"`; the app registers that category with **Done / Snooze 15 min / In 1 hour** buttons.

### Today and daily rhythm

| Method | Path | Query / Body | Response `data` |
|--------|------|--------------|-----------------|
| GET | `/today` | — | `TodayBrief` |
| GET | `/checkins/today` | — (starts today's check-in with the friend's opening message on first call) | `DailyCheckin` |
| POST | `/checkins/today/reply` | `{ text: string }` (1..1000; 20/min). The third reply wraps up automatically | `CheckinReply` |
| POST | `/checkins/today/finish` | — (needs at least one reply) | `CheckinReply` |
| GET | `/checkins/mood` | `days=7..90` (default 30) | `MoodPoint[]` (oldest first) |
| GET | `/checkins/mood/insights` | — | `MoodInsights` (weekly patterns, trend, best and hardest weekday, what lifts and drains the user) |
| GET | `/nudges/:id` | — | `CompanionNudge` |
| POST | `/nudges/:id/reply` | `{ text: string }` | `NudgeReply` |
| POST | `/nudges/:id/dismiss` | — | `204` |
| GET | `/recaps` | `limit=1..12` (default 4) | `WeeklyRecap[]` (newest first) |

The worker runs a 5-minute tick (`companion` queue) and, in each user's time zone: sends the **morning brief** at `wakeTime` (push + in-app, opens Today), the **evening check-in** at `checkinTime` (opens `/checkin`; lighter wording after a missed one), **night learning** at 03:00 (marks an unanswered check-in missed, updates warmth and `relationshipStage`, refreshes the profile summary, and may plan at most one **proactive nudge** for the day, never in quiet hours or within an hour of the check-in), and the **weekly recap** on Sunday at 18:00 (email + in-app, opens `/recap`). The daily digest is now email-only.

### Memory, You and privacy (user-flow §10)

| Method | Path | Query / Body | Response `data` |
|--------|------|--------------|-----------------|
| GET | `/memory/timeline` | `before?` (ISO, the previous page's `nextCursor`) | `MemoryTimeline`: conversations, recorded meetings, check-in highlights and email summaries (never promotions or phishing) grouped by local day |
| GET | `/memory/search` | `q` (1..300; 30/min) | `MemorySearch`: by meaning (pgvector over conversations) plus word matches in check-ins and email summaries. No match → `results: []` and `related` (loosely related or recent memories) |
| GET | `/memory/people` | `q?` | `PersonListItem[]` (most recently talked to first; built from past conversations on first visit) |
| POST | `/memory/people` | `{ name; relationship?; facts? }` | `PersonDetail` (201; `409` if a card with that name exists) |
| GET | `/memory/people/:id` | — | `PersonDetail` |
| PATCH | `/memory/people/:id` | `{ name?; relationship?; facts? }` | `PersonDetail`. A new name is fixed in every conversation with them, remembered for future transcripts, and merges into an existing card with that name |
| DELETE | `/memory/people/:id` | — | `204` (the card goes; conversations stay) |
| POST | `/memory/conversations/:id/fix-name` | `{ from; to; onlyHere? }` | `NameFixResult`. A real name is fixed in every conversation that has it (speaker labels, transcript, summary, to-dos, reminders, people card) and saved as a correction applied to new transcripts before their summary is written; a label like "Speaker 2" only in this conversation |
| PATCH | `/memory/conversations/:id/summary` | `{ summary }` | `{ summary }` |
| PATCH | `/memory/conversations/:id/transcript/:seq` | `{ text }` | `{ seq; text }` |
| GET | `/memory/corrections` | — | `NameCorrection[]` |
| DELETE | `/memory/corrections` | `from` | `NameCorrection[]` (stops applying that fix to new transcripts) |

`id` of a memory item opens `/capture/:id` (conversation), `/meeting/:id` (meeting) or `/email/:id` (email); check-ins
show inline. People cards are updated after every processed conversation (speakers and the people the recording
mentions, never the user). Promises both ways are open to-dos: **they promised you** = someone else's to-do assigned
to the person; **you promised them** = your to-do that mentions them. With `learningPaused` the friend keeps memories,
people cards and reminders but adds no facts from chats or check-ins, keeps warmth, the profile summary and mood
insights as they are, and stops learning push timing; facts the user ticks in a review are still saved. Deletes in the
app wait a few seconds with an Undo bar before calling the API.

```ts
type MemoryKind = 'conversation' | 'meeting' | 'checkin' | 'email';
interface MemoryItem { kind: MemoryKind; id: string; title: string; snippet: string | null; at: ISODate;
  mood: number | null /* 1..5 */; people: string[]; }
interface MemoryDay { date: string /* local YYYY-MM-DD */; items: MemoryItem[]; }
interface MemoryTimeline { days: MemoryDay[]; nextCursor: ISODate | null; }
interface MemorySearchResult { item: MemoryItem; quote: string | null; similarity: number | null; }
interface MemorySearch { query: string; results: MemorySearchResult[]; related: MemoryItem[]; }
interface PersonListItem { id: string; name: string; relationship: string | null; lastTalkedAt: ISODate | null;
  conversationCount: number; openPromises: number; }
interface PersonPromise { id: string; title: string; dueAt: ISODate | null; status: string; }
interface PersonDetail extends PersonListItem { facts: string[]; aliases: string[];
  promises: { iOwe: PersonPromise[]; theyOwe: PersonPromise[] }; conversations: MemoryItem[]; }
interface NameCorrection { from: string; to: string; }
interface NameFixResult { conversations: number; remembered: boolean; }
interface MoodInsights { days: MoodPoint[] /* 28 */; weekdays: { weekday: number /* 0 Sun */; mood: number | null;
  energy: number | null }[]; averageMood: number | null; averageEnergy: number | null;
  trend: 'up' | 'down' | 'flat' | null; bestDay: number | null; hardestDay: number | null;
  lifts: string[]; drains: string[]; note: string | null; checkins: number; updatedAt: ISODate | null; }
interface DataExportStatus { status: 'none' | 'preparing' | 'ready'; url: string | null;
  requestedAt: ISODate | null; expiresAt: ISODate | null; }
```

### Notifications

| Method | Path | Query | Response `data` |
|--------|------|-------|-----------------|
| GET | `/notifications` | `unreadOnly?=true`, `page`, `limit` | `AppNotification[]` + `meta` |
| GET | `/notifications/unread-count` | — | `{ count: number }` |
| PATCH | `/notifications/:id/read` | — | `AppNotification` |
| POST | `/notifications/:id/opened` | — (a push was tapped: marks it read and records the hour, so nudges move to times the user answers) | `AppNotification` |
| POST | `/notifications/read-all` | — | `{ updated: number }` |

**How notifications decide (user-flow §09).** Every push has a priority: **critical** (timed reminders, `action_item_due`, meeting brief / starting, urgent email) is pushed now, or held until quiet hours / focus mode end unless `criticalBreakThrough` is on or the sender is a VIP; **normal** (capture ready, task created, check-in, nudge …) is pushed now, but in quiet hours or beyond the daily `pushBudget` (default 8; the morning brief, check-in and recap don't count) it is counted into one `push_bundle` ("3 new updates") at the end of quiet hours or the next hour; **low** (the digest) is never pushed. The same notification twice within 10 minutes is merged. Everything still lands in the in-app inbox. `nudgesPausedUntil` ("take a break") stops the morning brief, check-in, proactive nudges, reminder follow-ups and quick-notes prompts; timed reminders still come. With push off, the inbox plus the daily email digest carry everything.

### Devices (push)

| Method | Path | Body | Response `data` |
|--------|------|------|-----------------|
| GET | `/devices` | — | `Device[]` |
| POST | `/devices` | `{ expoPushToken: string; platform: 'android'\|'ios'; deviceName?: string; appVersion?: string }` (upsert by token) | `Device` |
| DELETE | `/devices/:expoPushToken` | — | `204` |

### Ask AI

| Method | Path | Body / Query | Response `data` |
|--------|------|--------------|-----------------|
| POST | `/assistant/ask` | `{ question: string; threadId?: string; meetingId?: string }` | `{ threadId: string; message: AssistantMessage }` (the assistant's reply) |
| GET | `/assistant/threads` | `page`, `limit` | `AssistantThread[]` + `meta` |
| GET | `/assistant/threads/:id/messages` | — | `AssistantMessage[]` (oldest first) |
| DELETE | `/assistant/threads/:id` | — | `204` |

### Realtime (Socket.IO)

- URL: `{API_URL}` with namespace `/realtime`, default path `/socket.io`.
- Auth: `io(url + '/realtime', { withCredentials: true })` (web cookie) or `{ auth: { token: accessToken } }` (mobile).
- Server → client events:
  - `notification:new` → `AppNotification`
  - `meeting:updated` → `{ id: string; status: MeetingStatus; failureReason: string | null }`
  - `reminder:fired` → `Reminder`

---

## 5. Admin API (`/admin/*`)

All admin endpoints require an admin session except `login`/`refresh`. The role required is listed;
`super_admin` can do everything. `viewer` can call every `GET`.

### Admin types

```ts
type AdminRole = 'super_admin' | 'admin' | 'editor' | 'viewer';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  status: 'active' | 'disabled';
  avatarUrl: string | null;
  lastLoginAt: ISODate | null;
  createdAt: ISODate;
}

interface AdminUserListItem extends User {
  lastLoginAt: ISODate | null;
  meetingsCount: number;
}

interface AdminUserDetail extends AdminUserListItem {
  settings: UserSettings;
  integration: Integration;
  devices: Device[];
  stats: { meetings: number; completedMeetings: number; actionItems: number; reminders: number };
}

interface AdminMeetingListItem extends MeetingListItem {
  user: { id: string; email: string; name: string | null };
  failureReason: string | null;
}

interface AdminDashboardStats {
  users: { total: number; newLast7Days: number; activeLast7Days: number; suspended: number };
  meetings: { total: number; today: number; inProgress: number; processing: number; failedLast7Days: number; completedLast7Days: number };
  actionItems: { total: number; open: number };
  reminders: { pending: number; sentLast7Days: number };
  queues: QueueStats[];
  signupsByDay: { date: string; count: number }[];      // last 30 days, zero-filled
  meetingsByDay: { date: string; completed: number; failed: number }[];  // last 30 days, zero-filled
}

interface QueueStats {
  name: 'calendar-sync' | 'meeting-bot' | 'bot-events' | 'ai-processing' | 'notifications' | 'digest';
  waiting: number; active: number; delayed: number; failed: number; completed: number; paused: boolean;
}

interface FailedJob { id: string; name: string; failedReason: string; attemptsMade: number; timestamp: number; data: unknown }

interface AppSettingRecord<K extends SettingKey = SettingKey> {
  key: K;
  value: SettingValue[K];
  isPublic: boolean;
  description: string | null;
  updatedAt: ISODate;
}

type SettingKey = 'branding' | 'theme' | 'features' | 'app' | 'seo' | 'ai' | 'bot' | 'notifications';

interface SettingValue {
  branding: Branding;
  theme: Theme;
  features: Features;
  app: AppMeta;
  seo: Seo;
  ai: {
    model: string;                 // e.g. "gemini-3.5-flash" (1.x/2.x models are rejected as deprecated)
    embeddingModel: string;        // e.g. "gemini-embedding-001"
    temperature: number;           // 0..2
    maxOutputTokens: number;
    outputLanguage: string;        // "auto" or a language name
    enableEmbeddings: boolean;
  };
  bot: {
    provider: 'self_hosted' | 'recall';  // who joins: Chromium runner (bot container) or Recall.ai
    recall: {
      transcription: 'recallai_streaming' | 'meeting_captions';  // Recall.ai STT (paid) or Meet captions (free)
      languageCode: string;              // "auto" or a code like en, en_us, de
      deleteMediaAfterImport: boolean;   // delete recording/transcript on Recall.ai once imported
    };
    botName: string;
    joinBeforeMinutes: number;
    waitingRoomTimeoutMinutes: number;
    maxDurationMinutes: number;
    leaveWhenAloneMinutes: number;
    autoJoinDefault: 'all' | 'owned' | 'none';
    headless: boolean;
    selectors: Record<string, string>;   // CSS/XPath selectors for Meet DOM — hot-fixable
  };
  notifications: {
    pushEnabled: boolean;
    emailEnabled: boolean;
    fromName: string;
    fromEmail: string;
    defaultMeetingReminderMinutes: number;
    digestEnabled: boolean;
  };
}

interface AdminSection extends Section { name: string; platform: 'web' | 'mobile' | 'all'; isActive: boolean; createdAt: ISODate; updatedAt: ISODate }
interface AdminNavItem extends NavItem { location: NavLocation; requiredFeature: keyof Features | null; isActive: boolean }
interface AdminBanner extends Banner { platform: 'web' | 'mobile' | 'all'; startsAt: ISODate | null; endsAt: ISODate | null; sortOrder: number; isActive: boolean }
interface AdminPlan extends Plan { isActive: boolean; usersCount: number }

interface MediaAsset {
  id: string; publicId: string; url: string; resourceType: string; format: string | null;
  width: number | null; height: number | null; bytes: number | null; folder: string | null; alt: string | null; createdAt: ISODate;
}

interface AiPrompt { key: string; name: string; description: string | null; content: string; version: number; updatedAt: ISODate }

interface NotificationTemplate {
  key: string; name: string; titleTemplate: string; bodyTemplate: string;
  emailSubject: string | null; emailBody: string | null; channels: ReminderChannel[]; isActive: boolean; updatedAt: ISODate;
}

interface Broadcast {
  id: string; title: string; body: string; channels: ReminderChannel[];
  audience: { type: 'all' } | { type: 'users'; userIds: string[] } | { type: 'plan'; planId: string };
  sentCount: number; createdAt: ISODate; createdBy: { id: string; name: string } | null;
}

interface AuditLog {
  id: number; action: string; entity: string; entityId: string | null; changes: unknown;
  ip: string | null; createdAt: ISODate; admin: { id: string; name: string; email: string } | null;
}
```

### Endpoints

| Method | Path | Role | Body / Query | Response `data` |
|--------|------|------|--------------|-----------------|
| POST | `/admin/auth/login` | — | `{ email; password }` | `{ admin: AdminUser; tokens: AuthTokens }` + cookies |
| POST | `/admin/auth/refresh` | — | `{ refreshToken? }` | `{ tokens: AuthTokens }` + cookies |
| POST | `/admin/auth/logout` | any | — | `204` |
| GET | `/admin/auth/me` | any | — | `AdminUser` |
| PATCH | `/admin/auth/me` | any | `{ name?; avatarUrl?; currentPassword?; newPassword? }` | `AdminUser` |
| GET | `/admin/dashboard/stats` | viewer | — | `AdminDashboardStats` |
| GET | `/admin/users` | viewer | `q?`, `status?`, `planId?`, `page`, `limit`, `sort?` (`createdAt:desc`) | `AdminUserListItem[]` + meta |
| GET | `/admin/users/:id` | viewer | — | `AdminUserDetail` |
| PATCH | `/admin/users/:id` | admin | `{ name?; status?; planId? }` | `AdminUserDetail` |
| DELETE | `/admin/users/:id` | super_admin | — | `204` |
| GET | `/admin/meetings` | viewer | `q?`, `status?`, `userId?`, `from?`, `to?`, `page`, `limit` | `AdminMeetingListItem[]` + meta |
| GET | `/admin/meetings/:id` | viewer | — | `MeetingDetail & { user: {...} }` |
| GET | `/admin/meetings/:id/transcript` | viewer | — | `TranscriptSegment[]` |
| POST | `/admin/meetings/:id/reprocess` | admin | — | `{ queued: true }` |
| DELETE | `/admin/meetings/:id` | admin | — | `204` |
| GET | `/admin/settings` | viewer | — | `AppSettingRecord[]` |
| GET | `/admin/settings/:key` | viewer | — | `AppSettingRecord` |
| PUT | `/admin/settings/:key` | editor (branding, theme, seo); admin (others) | `{ value: SettingValue[key] }` (full object, validated) | `AppSettingRecord` |
| GET | `/admin/sections` | viewer | `page?`, `platform?` | `AdminSection[]` (sorted) |
| POST | `/admin/sections` | editor | `{ page; type; name; content; platform?; isActive? }` | `AdminSection` |
| PATCH | `/admin/sections/:id` | editor | partial of the above | `AdminSection` |
| DELETE | `/admin/sections/:id` | editor | — | `204` |
| POST | `/admin/sections/reorder` | editor | `{ ids: string[] }` (new order; `sortOrder = index`) | `AdminSection[]` |
| GET | `/admin/pages` | viewer | `q?`, `status?`, `page`, `limit` | `CmsPage[]` + meta |
| GET | `/admin/pages/:id` | viewer | — | `CmsPage` |
| POST | `/admin/pages` | editor | `{ slug; title; content; seo?; status? }` | `CmsPage` |
| PATCH | `/admin/pages/:id` | editor | partial | `CmsPage` |
| DELETE | `/admin/pages/:id` | editor | — | `204` |
| GET | `/admin/navigation` | viewer | `location?` | `AdminNavItem[]` |
| POST | `/admin/navigation` | editor | `{ location; label; href; icon?; groupLabel?; requiredFeature?; isExternal?; isActive? }` | `AdminNavItem` |
| PATCH | `/admin/navigation/:id` | editor | partial | `AdminNavItem` |
| DELETE | `/admin/navigation/:id` | editor | — | `204` |
| POST | `/admin/navigation/reorder` | editor | `{ ids: string[] }` | `AdminNavItem[]` |
| GET | `/admin/banners` | viewer | `platform?`, `placement?` | `AdminBanner[]` |
| POST | `/admin/banners` | editor | `{ platform; placement; variant; title; body?; imageUrl?; ctaLabel?; ctaUrl?; startsAt?; endsAt?; isActive? }` | `AdminBanner` |
| PATCH | `/admin/banners/:id` | editor | partial | `AdminBanner` |
| DELETE | `/admin/banners/:id` | editor | — | `204` |
| GET | `/admin/plans` | viewer | — | `AdminPlan[]` |
| POST | `/admin/plans` | admin | Plan fields minus `id` | `AdminPlan` |
| PATCH | `/admin/plans/:id` | admin | partial | `AdminPlan` |
| DELETE | `/admin/plans/:id` | admin | — | `204` (`409 CONFLICT` if users are on it or it is default) |
| GET | `/admin/media` | viewer | `folder?`, `q?`, `page`, `limit` | `MediaAsset[]` + meta |
| POST | `/admin/media/upload` | editor | multipart: `file` (image ≤ 10 MB: png, jpg, webp, svg, gif, ico), `folder?`, `alt?` | `MediaAsset` |
| PATCH | `/admin/media/:id` | editor | `{ alt }` | `MediaAsset` |
| DELETE | `/admin/media/:id` | editor | — | `204` (also deletes from Cloudinary) |
| GET | `/admin/ai/prompts` | viewer | — | `AiPrompt[]` |
| PUT | `/admin/ai/prompts/:key` | admin | `{ content; name?; description? }` (increments `version`) | `AiPrompt` |
| POST | `/admin/ai/test` | admin | `{ transcript: string; title?: string }` (runs `meeting_report` without saving) | `{ report: MeetingReport; actionItems: Partial<ActionItem>[]; reminders: { title: string; remindAt: ISODate }[]; latencyMs: number }` |
| GET | `/admin/notification-templates` | viewer | — | `NotificationTemplate[]` |
| PUT | `/admin/notification-templates/:key` | admin | `{ name?; titleTemplate; bodyTemplate; emailSubject?; emailBody?; channels; isActive }` | `NotificationTemplate` |
| GET | `/admin/broadcasts` | viewer | `page`, `limit` | `Broadcast[]` + meta |
| POST | `/admin/broadcasts` | admin | `{ title; body; channels; audience; data? }` | `Broadcast` |
| GET | `/admin/admins` | super_admin | — | `AdminUser[]` |
| POST | `/admin/admins` | super_admin | `{ email; name; role; password }` | `AdminUser` |
| PATCH | `/admin/admins/:id` | super_admin | `{ name?; role?; status?; password? }` | `AdminUser` |
| DELETE | `/admin/admins/:id` | super_admin | — | `204` (cannot delete self) |
| GET | `/admin/audit-logs` | admin | `entity?`, `adminId?`, `page`, `limit` | `AuditLog[]` + meta |
| GET | `/admin/system/queues` | viewer | — | `QueueStats[]` |
| GET | `/admin/system/queues/:name/failed` | admin | `page`, `limit` | `FailedJob[]` + meta |
| POST | `/admin/system/queues/:name/retry-failed` | admin | — | `{ retried: number }` |
| POST | `/admin/system/cache/flush` | admin | — | `{ flushed: number }` |
| GET | `/admin/bot/providers` | viewer | — | `BotProviderStatus` |
| POST | `/admin/bot/recall/test` | admin | — | `{ ok: boolean; message: string }` |

```ts
// Secrets are never returned, only whether they are set on the server.
interface BotProviderStatus {
  recall: { apiKeyConfigured: boolean; webhookSecretConfigured: boolean; region: string; webhookUrl: string; dashboardUrl: string };
  selfHosted: { mode: 'puppeteer' | 'simulate'; persistentProfile: boolean };
}
```

**Provider webhooks** (called by Recall.ai, not by clients; not wrapped in the envelope):

| Method | Path | Auth | Response |
|---|---|---|---|
| POST | `/webhooks/recall` | `webhook-id` / `webhook-timestamp` / `webhook-signature` (HMAC-SHA256 with `RECALL_WEBHOOK_SECRET`, ±5 min) | `{ received: true }` · `401` when unsigned, tampered or stale |

---

## 6. Environment variables (client side)

| App     | Variable | Example |
|---------|----------|---------|
| Website | `NEXT_PUBLIC_API_URL` | `http://localhost:4000` |
| Website | `API_URL_INTERNAL` (server-side fetches) | `http://localhost:4000` |
| Website | `REVALIDATE_SECRET` | shared with backend `WEB_REVALIDATE_SECRET` |
| Admin   | `NEXT_PUBLIC_API_URL` | `http://localhost:4000` |
| Mobile  | `EXPO_PUBLIC_API_URL` | `http://localhost:4000` (iOS simulator reaches localhost directly; Android emulator needs `adb reverse tcp:4000 tcp:4000`; physical devices need a LAN IP or tunnel) |

Clients append `/api/v1` themselves.

---

## 7. Website revalidation webhook (backend → website)

After any admin write to settings, sections, pages, navigation, banners or plans, the backend calls (best effort,
2 s timeout, failures logged and ignored):

```
POST {WEB_REVALIDATE_URL}            # http://localhost:3000/api/revalidate
x-revalidate-secret: {WEB_REVALIDATE_SECRET}
Content-Type: application/json

{ "tags": ["config"] }
```

Accepted tags: `config`, `sections`, `sections:<page>`, `pages`, `page:<slug>`, `plans`. Every cached website
entry also carries `config`, so `["config"]` refreshes everything; the narrower tags are optional optimisations.
Responses: `200 { revalidated: true, tags }`, `400` (no allowed tags / bad JSON), `401` (bad secret), `413` (> 4 KB).
