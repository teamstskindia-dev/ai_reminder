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
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;              // access token lifetime, seconds
}

// ---------- Meetings ----------
type MeetingStatus =
  | 'scheduled' | 'joining' | 'waiting_room' | 'in_progress'
  | 'processing' | 'completed' | 'failed' | 'cancelled' | 'skipped';

type MeetingPlatform = 'google_meet' | 'zoom' | 'teams' | 'other';

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
  source: 'calendar' | 'manual' | 'upload';
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
  status: 'pending' | 'sent' | 'cancelled' | 'failed';
  source: 'ai' | 'manual' | 'system';
  meetingId: string | null;
  meetingTitle: string | null;
  actionItemId: string | null;
  sentAt: ISODate | null;
  createdAt: ISODate;
}

// ---------- Notifications ----------
type NotificationType =
  | 'meeting_upcoming' | 'report_ready' | 'action_item_due' | 'reminder'
  | 'daily_digest' | 'bot_failed' | 'broadcast';

interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: { meetingId?: string; actionItemId?: string; reminderId?: string; url?: string; [k: string]: unknown };
  readAt: ISODate | null;
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
interface Integration {
  provider: 'google_calendar';
  connected: boolean;
  accountEmail: string | null;
  lastSyncedAt: ISODate | null;
  syncError: string | null;
}

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
  | 'shield' | 'zap' | 'clock' | 'search' | 'mail' | 'globe' | 'users' | 'file-text' | 'bell' | 'check';
```

Web sidebar `href`s are app paths: `/dashboard`, `/analytics/reports`, `/analytics/overview`, `/calendar`,
`/action-items`, `/reminders`, `/ask`, `/settings`.
Mobile tab `href`s are expo-router tab names: `home`, `meetings`, `reminders`, `ask`, `profile`.
The mobile app shows only tabs present in `navigation.mobile_tab` (in that order) and uses each `label`.

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
| PATCH | `/me` | `{ name?: string; timezone?: string; locale?: string; onboarded?: true }` | `User` |
| DELETE | `/me` | — | `204` (deletes account and all data, revokes Google token) |
| GET | `/me/settings` | — | `UserSettings` |
| PATCH | `/me/settings` | `Partial<UserSettings>` | `UserSettings` |

### Integrations

| Method | Path | Response `data` |
|--------|------|-----------------|
| GET | `/integrations` | `Integration[]` |
| POST | `/integrations/google-calendar/sync` | `{ queued: true }` |
| DELETE | `/integrations/google-calendar` | `204` (revokes token, stops sync, cancels scheduled bots) |

To reconnect, the client restarts the `/auth/google` flow.

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
| POST | `/meetings` | `{ title: string; meetingUrl: string; startAt: ISODate; endAt?: ISODate; autoJoin?: boolean }` (manual add; Meet URL validated) | `MeetingDetail` |
| PATCH | `/meetings/:id` | `{ title?: string; autoJoin?: boolean }` | `MeetingDetail` |
| DELETE | `/meetings/:id` | — | `204` |
| POST | `/meetings/:id/bot/join` | — (send the bot now; meeting must have a URL and not be finished) | `MeetingDetail` |
| POST | `/meetings/:id/bot/leave` | — | `MeetingDetail` |
| POST | `/meetings/:id/reprocess` | — | `{ queued: true }` |
| POST | `/meetings/upload` | `multipart/form-data`: `file` (audio ≤ 200 MB: mp3, m4a, wav, webm, ogg; or transcript ≤ 5 MB: txt, vtt, srt), `title`, `startAt?` | `MeetingDetail` (status `processing`) |

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
| GET | `/reminders` | `status=pending\|sent\|cancelled\|all` (default `pending`), `from?`, `to?`, `page`, `limit` | `Reminder[]` + `meta` (sorted by `remindAt` asc) |
| POST | `/reminders` | `{ title; body?; remindAt; channels?: ReminderChannel[]; meetingId?; actionItemId? }` (`remindAt` must be in the future) | `Reminder` |
| PATCH | `/reminders/:id` | `{ title?; body?; remindAt?; channels?; status?: 'cancelled' }` | `Reminder` |
| DELETE | `/reminders/:id` | — | `204` |
| POST | `/reminders/:id/snooze` | `{ minutes: number }` (5..1440) | `Reminder` |

### Notifications

| Method | Path | Query | Response `data` |
|--------|------|-------|-----------------|
| GET | `/notifications` | `unreadOnly?=true`, `page`, `limit` | `AppNotification[]` + `meta` |
| GET | `/notifications/unread-count` | — | `{ count: number }` |
| PATCH | `/notifications/:id/read` | — | `AppNotification` |
| POST | `/notifications/read-all` | — | `{ updated: number }` |

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
  name: 'calendar-sync' | 'meeting-bot' | 'ai-processing' | 'notifications' | 'digest';
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
