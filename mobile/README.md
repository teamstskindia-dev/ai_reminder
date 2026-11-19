# Remi mobile (iOS + Android)

React Native (Expo SDK 58, expo-router) client for Remi, the AI meeting assistant: Google sign-in, a
calendar-driven notetaker, meeting reports, Ask AI, reminders and push notifications. One codebase, iOS and
Android as first-class targets.

Everything user-visible is **driven by the backend's public config** (`GET /api/v1/public/config?platform=mobile`),
which operators edit in the admin panel. See [Config-driven behaviour](#config-driven-behaviour).

## Quick start

```bash
cd mobile
npm install
cp .env.example .env          # then edit EXPO_PUBLIC_API_URL / EAS_PROJECT_ID
npx expo start                # press "i" for the iOS simulator, "a" for an Android emulator
```

| Variable | Purpose |
| -------- | ------- |
| `EXPO_PUBLIC_API_URL` | Backend origin, e.g. `http://localhost:4000` (the app appends `/api/v1`). Inlined at bundle time — restart Metro after changing it. |
| `EAS_PROJECT_ID` | Expo project id for Expo push tokens (`extra.eas.projectId`). Optional; push registration is skipped without it. |
| `APP_ENV` | `development` (default for local runs) · `preview` · `production`. Set per EAS profile; only `development` allows plain-HTTP backends. |
| `APP_BUILD_NUMBER` | Optional. Drives both the iOS `buildNumber` and Android `versionCode` (default `1`). The marketing version lives in `app.config.ts`. |
| `GOOGLE_SERVICES_JSON` | Optional path to `google-services.json` (FCM) for Android push. |

Scripts: `npm run typecheck`, `npm run lint`, `npm run doctor`, `npm run export:ios`, `npm run export:android`.

## Running on simulators and devices

### iOS

- **Simulator**: `npx expo run:ios` (development build; needs Xcode and CocoaPods). The simulator shares the Mac's
  network, so `http://localhost:4000` reaches the backend directly — no port forwarding needed.
- **Physical iPhone**: `localhost` is the phone itself. Use the Mac's LAN IP (`EXPO_PUBLIC_API_URL=http://192.168.x.y:4000`)
  or an HTTPS tunnel. Development builds allow local-network HTTP (`NSAllowsLocalNetworking`); preview/production
  builds are HTTPS-only (no `NSAllowsArbitraryLoads`, ever).

### Android

- **Emulator**: its `localhost` is the emulator. Forward the port so `http://localhost:4000` works:

  ```bash
  adb reverse tcp:4000 tcp:4000      # re-run after the emulator restarts; also works for USB devices
  ```

- `npx expo run:android` builds a local development build (Android Studio / SDK). Cleartext HTTP is enabled only for
  `APP_ENV=development` builds (`expo-build-properties` → `usesCleartextTraffic`); preview/production are HTTPS-only.

Expo Go can run most of the app, but remote push needs a development build (see [Push notifications](#push-notifications)).

### Google sign-in (PKCE)

The app starts `GET /api/v1/auth/google?platform=mobile&redirectUri=<deep link>&codeChallenge=<S256>` in
ASWebAuthenticationSession (iOS) / Custom Tabs (Android). Google redirects to the **backend** callback, which redirects
to the app (`remi://auth/callback?code=…`, or `exp://…/--/auth/callback?code=…` in Expo Go). The app then calls
`POST /auth/exchange { code, codeVerifier }`.

- The PKCE verifier (32 random bytes, base64url) lives **in memory only** for that attempt. The code may arrive as the
  auth-session result or as a deep link through the router; both paths share one de-duplicated exchange. A callback the
  app didn't start (or after the app was killed mid sign-in) shows "Please try signing in again" and is never exchanged.
- Google only accepts `http://localhost…` or public **HTTPS** redirect URIs, so the backend's Google callback must be
  `http://localhost:4000/api/v1/auth/google/callback` (simulator / `adb reverse`) or a tunnel such as ngrok/cloudflared
  (then point `EXPO_PUBLIC_API_URL` at the tunnel too).
- The backend must allow the app's redirect schemes in `MOBILE_REDIRECT_ALLOWLIST` (`remi://`, `exp://`).

### Sign-in options

Google (all platforms), email code (all platforms) and Sign in with Apple (iOS only, see Builds below).

### Email sign-in

"Continue with email" sends a 6-digit code (`POST /auth/email/start`, then `/auth/email/verify`). Without SMTP settings
on the backend (development), the code is printed in the API log instead of being emailed.

## First-run setup (user-flow §02)

After sign-in, while `user.onboardedAt` is `null`, the app shows `/setup` instead of the tabs (`src/features/setup/`):

1. **Connect your day** (Google sign-ins only): Google Calendar now or later; Gmail is shown as coming soon.
2. **Get-to-know-you chat**: four warm questions, answered by text or voice (mic button → `expo-audio` →
   `POST /onboarding/transcribe`). Replies mirror English, Hinglish or a mix, and the rest of setup follows that style.
   The answers become the first personality profile (`POST /onboarding/profile`); skipping leaves it empty.
3. **Microphone** and 4. **Notifications** permissions, each skippable with a graceful fallback (push off → in-app
   plus an optional email digest). Push registration waits until this step, so the OS prompt never appears earlier.
5. **Daily rhythm**: wake time, quiet hours, evening check-in (`PATCH /me/settings`).
6. **Recording note** (one time) and 7. **First nudge**, then `POST /onboarding/complete` stamps `onboardedAt`, sends the
   welcome email and the guards land the user on Today.

Progress is saved per user in AsyncStorage, so closing the app mid-setup resumes at the same step. Profile shows
"What I know about you" (deletable) and the daily rhythm afterwards.

The microphone is now used (`expo-audio` plugin in `app.config.ts`), so voice answers need a development build.

## A day with your friend (user-flow §03)

- **Today** (first tab, `src/features/home/HomeScreen.tsx`, `GET /today`): a greeting in the user's style, a one-line
  brief, today's nudge, the evening check-in card, today's meetings, today's reminders (round button = Done) and open
  to-dos and promises.
- **Morning brief**: a push at wake time that opens Today (sent by the worker; on/off in Profile → Daily rhythm).
- **Reminders**: the push has **Done / Snooze 15 min / In 1 hour** buttons (category `reminder`, registered in
  `src/features/push/handler.ts`; the buttons open the app, which calls the API). Tapping the notification opens
  `/reminder/[id]` with Done and Snooze (15 min, 1 hour, tonight, tomorrow). An ignored reminder gets one gentle
  follow-up, then shows up in the evening check-in.
- **Evening check-in** (`/checkin`): a short chat by text or voice; the friend reflects, celebrates wins, then wraps
  up with tomorrow's plan and what is still open, and notes mood and energy.
- **Proactive nudge** (`/nudge/[id]`): at most one a day, planned by night learning; reply or "Not now".
- **Weekly recap** (`/recap`): every Sunday evening (email + in-app): highlights, promises kept, mood and people met.

All of this is JavaScript only: no new native modules, so no rebuild of the development build is needed.

## Tap to record a conversation (user-flow §04)

`src/features/capture/`, API under `/captures` (see `docs/API_CONTRACT.md`).

- **Record button**: a floating mic on every tab (`RecordFab`) opens `/capture/record`, which starts right away. The
  first recording ever shows a one-time consent reminder ("let people know you're recording").
- **Recording screen** (`RecordScreen`, engine in `useCaptureRecorder`): timer, live waveform (metering), clear
  recording indicator, pause/resume, bookmark this moment, optional title, **Stop & save**, **Stop and delete**.
  "Still recording?" every 90 minutes; hard stop at 4 hours. Recording continues with the screen locked
  (`enableBackgroundRecording` in the `expo-audio` plugin), so **this needs a rebuilt development build**.
- **Crash-safe parts**: audio is recorded in parts of 5 minutes; each finished part is moved to the documents folder
  and the session is saved (`captureStore`). After a crash, app kill or dead battery, the next start keeps the saved
  parts and sends them ("Saved 12 min of your last recording").
- **Interruptions**: if the mic stops delivering (a phone call, another app), the recording pauses with a banner;
  Resume starts a fresh part. Android's back button never silently drops a running recording.
- **Offline queue** (`uploadQueue`): recordings wait on the phone and are sent when online (on start, on reconnect,
  on resume, every minute), part by part with retries and backoff (`POST /captures` → `PUT /captures/:id/parts/:i`
  → `POST /captures/:id/finish`). Uploads use XMLHttpRequest (`src/api/multipart.ts`): `expo/fetch` rejects React
  Native file parts.
- **Today cards** (`CaptureCards`): sending / waiting for internet, processing, ready to review (with things to
  confirm), failed (try again or delete). The `capture_ready` push opens the review card.
- **Review card** (`/capture/[id]`, `CaptureScreen`): a quick check for reminders the friend didn't set because
  something was unclear ("Rohit or Rahul?", with one-tap answers, editable title and time), summary, to-dos and
  reminders (edit, complete or remove), people, facts about you (ticked ones are remembered on Save), mood,
  bookmarks and the transcript. Never reviewing is fine: clear reminders are already set, and unreviewed questions
  come up in the evening check-in. Raw audio is deleted after processing.
- **Not yet**: home-screen widget and lock-screen shortcut, low storage/battery warnings, sending tasks to
  Notion/Jira (MVP+), people cards (Memory).

## Talk with your friend (user-flow §05)

The `ask` tab is now **Talk** (`src/features/talk/`, API `/talk/*`).

- **Three ways to talk**: type; **hold the mic** to speak (release sends); or a **voice conversation** (wave icon):
  listen → the friend answers out loud (`expo-speech`) → listen again, a pause in speech ends a turn.
  `expo-speech` is a native module, so this needs a rebuilt development build.
- The friend replies in your style and relationship stage, answers "what did Rahul say…" from memory with **source
  cards**, and says so honestly when it doesn't know.
- **Actions**: reminders are set at once (card with Open). A meeting ("set a call with Rahul Friday afternoon") comes
  back as an **invite preview** (free slot from your calendar, Rahul's email from past meetings; edit time, length,
  guests) and is only sent on **Send invite**. Email drafts open in your own email app. Jira/Notion are not connected
  yet, so tasks go to your to-dos. Reading email is "coming soon".
- **Incognito** (eye icon): nothing saved or learned. **Crisis**: a care card with Tele-MANAS 14416 and 112.
- History (clock icon) lists past conversations; long-press to delete.

## Google Calendar and meetings (user-flow §06)

- Upcoming meetings show a **Prep** card (meeting screen): who is coming, what you last discussed with them, open
  promises both ways, talking points, double-booking warning, what is right after, and **Record this meeting**.
- Pushes: pre-meeting brief (30 min before by default), **"… is starting: record it?"** and **"How did … go? Add
  quick notes"** after an unrecorded meeting. Both open the recorder linked to the event (`/capture/record?meetingId=`;
  quick notes stop at 2 minutes).
- A recording linked to a meeting takes its title and attendees; its review card shows the meeting chip and a
  **follow-up email** draft to send from your own email (or skip). A recording that matches no event asks "Was this
  one of these meetings?" or keeps it standalone.
- Today marks double-booked meetings (**Overlaps**). In-person events (no video link) now sync too.
- Scheduling needs the calendar connected with write access: existing users reconnect once in Profile.

## Connected apps (user-flow §07, §08)

Profile → **Connected apps** (`/connected-apps`, `src/features/integrations/`): Google Calendar, Gmail, Outlook,
Notion, Jira, Linear and Todoist. Providers the server has no OAuth client for show "Coming soon".

- **Connect**: `GET /integrations/:provider/connect?redirectUri=remi://integrations/callback` returns a consent URL
  that opens in an auth session (`expo-web-browser`). The **API** finishes the OAuth exchange and redirects back with
  `?provider=…&status=connected` (or `&error=`); no token or secret ever reaches the phone. On Android the redirect
  may arrive through the router instead (`/integrations/callback`, filtered in `+native-intent.tsx`).
- Email asks **Read and send replies I approve** or **Read only**. Tools have a **default project** (Notion database,
  Jira project, Linear team, Todoist project) and **Send without asking** (off by default).
- Expired or revoked access shows **Reconnect** (and one `reconnect_needed` push a day).

## Reading your email (user-flow §07)

- **Today** shows **Emails that need you** (urgent + needs a reply) and a collapsible **digest** of FYI mail; without a
  connected inbox, a one-line invite to connect it. `/emails` lists Important / Reply / FYI / All (pull to refresh,
  ↻ checks the inbox now).
- **Email** (`/email/[id]`): the one-line summary and why it matters (never the body: it is not stored), a phishing
  warning, "codes, passwords and statements are never kept", **Spotted in this email** (deadline / bill / booking /
  travel → Remind me, Add to calendar, Dismiss), **Reply** (draft in your style → edit → **Send** from your account, or
  **Open in email app** when read-only), **Remind me later**, **Create a task**, and **Always alert me / Not important**
  (VIP and muted senders; also editable in Profile).
- The `email_important` push opens the email; an inbox flood becomes one push.
- In **Talk**: "summarize my mails today", "anything from HDFC this week?", "reply to Neha: yes, Thursday works"
  (draft → **Send**, threaded).

## Notion, Jira and other tools (user-flow §08)

- Long-press any to-do → **Send to Jira** (or pick a tool); a recorded meeting's review card has **Send to-dos to …**
  (team tasks too: the owner is assigned when the name is unambiguous).
- A similar open task in the tool asks **Merge** / **Create new**; a tool that is down keeps the to-do and retries.
- In **Talk**: "create a Jira ticket for the login bug" (preview → **Send**, or straight away with auto-send),
  "what is pending on my Jira?", "prep me for sprint review", "save this summary to Notion" (preview → **Save**).
- Done in the tool means done here (checked every 15 minutes); a changed due date moves the reminder.

## How notifications decide (user-flow §09)

Profile → **How I notify you**: important email alerts, **Always alert me** / **Not important** senders, the
**daily push limit** (more are bundled into one push), **critical alerts in quiet hours**, **focus mode** (1 h, 2 h,
4 h, until tomorrow morning) and **take a break** (1 day, 3 days, 1 week: no brief, check-ins or nudges; reminders
still come). Tapping a push calls `POST /notifications/:id/opened`, so proactive nudges move to the hours you answer.
In Talk, "I need a break for 3 days" does the same.

All of this is JavaScript only (`expo-web-browser` and `expo-linking` were already in the app): no rebuild of the
development build is needed.

## Builds (EAS)

The repo uses Continuous Native Generation — no committed `ios/` or `android/` folders. Native configuration lives in
`app.config.ts` (name **Remi**, scheme `remi`, bundle id / package `com.remi.app`, icons, splash, notification
icon/colour, ATS, cleartext, permissions). Profiles in `eas.json`:

| Profile | Use | Platforms |
| ------- | --- | --------- |
| `development` | Dev client, internal distribution, `APP_ENV=development` | iOS device + Android APK |
| `development-simulator` | Same, as an iOS simulator build | iOS |
| `preview` | Internal QA build, HTTPS-only, `APP_ENV=preview` | iOS ad hoc + Android APK |
| `production` | Store build, `APP_ENV=production` | iOS App Store + Android App Bundle |

```bash
npx eas-cli@latest build --profile development --platform ios        # or android / all
npx eas-cli@latest build --profile production --platform all
```

**Sign in with Apple (iOS):** the login screen shows the native Apple button on iOS (`expo-apple-authentication`,
`ios.usesAppleSignIn`), which App Store Review Guideline 4.8 requires alongside Google sign-in. The app sends Apple's
identity token to `POST /auth/apple`; the backend accepts audiences from `APPLE_CLIENT_IDS` (default `com.remi.app`).
It needs an Apple Developer account with the Sign in with Apple capability on the bundle id, and can only be tested on
iOS. Before release, account deletion should also revoke the Apple token (Apple's REST `revoke` endpoint), which is
not implemented yet.

## Push notifications

Requirements:

| | iOS | Android |
| - | --- | ------- |
| Build | Development or production build (`aps-environment` entitlement is generated by the `expo-notifications` plugin) | Development or production build — remote push doesn't work in Expo Go on Android since SDK 53 |
| Credentials | APNs key via EAS credentials (`npx eas-cli@latest credentials`) | FCM V1 service-account key uploaded to EAS, plus `google-services.json` (`GOOGLE_SERVICES_JSON`) |
| Common | `EAS_PROJECT_ID`, `features.pushNotifications` on in the admin panel, the user's "Push notifications" setting on | same |

After sign-in the app creates the Android `default` channel, asks for permission (iOS: alert, badge, sound — provisional
authorisation also counts), gets an Expo push token and upserts it with `POST /devices` (`platform: 'ios' | 'android'`).
Sign-out removes it. Denied permission, Expo Go, a missing project id or a simulator/emulator without push support are
all skipped gracefully. On iOS the app badge mirrors the unread notification count.

Taps deep-link through the link allowlist: `data.meetingId` → meeting detail, `data.url` → that route (or an https page),
otherwise the notifications screen. Foreground notifications show as banners.

## Config-driven behaviour

On launch the app shows the cached config instantly (AsyncStorage) and revalidates it with `If-None-Match`
(`304` keeps the cache) on launch and whenever the app returns to the foreground. If the API is unreachable on the
very first launch it falls back to bundled defaults that mirror `backend/supabase/seed.sql`.

| Config | Effect |
| ------ | ------ |
| `branding` | App name, tagline, logos (`logoUrl` / `logoDarkUrl` / `iconUrl`, letter-mark fallback), support email. |
| `theme` | Primary / foreground / accent colours and radius build the whole palette at runtime (light + dark surfaces derived). `defaultMode` forces light/dark, `system` follows the device. |
| `navigation.mobile_tab` | Which bottom tabs exist, their order, labels and icons (`home`, `meetings`, `reminders`, `ask`, `profile`). Missing tabs are hidden but still routable. |
| `features` | Hides Ask AI, analytics, reminders, action items, calendar and push UI; deep links to disabled features show a "not available" screen. |
| `banners` (`mobile_home`) | Dismissible banners on Home; CTAs open allowlisted in-app routes (`remi://…`) or https pages. |
| `app.maintenanceMode` | Full-screen maintenance view with `maintenanceMessage` and retry. Any API `503 MAINTENANCE` triggers it too. |
| `app.minAppVersion` | Installed version (semver) below it → force-update screen linking to `iosStoreUrl` / `androidStoreUrl` (no button if the platform's URL is empty). |
| Sections `mobile_onboarding` | First-launch onboarding slides (image, title, description, background colour). |
| CMS pages | About / privacy / terms render in-app from `GET /public/pages/:slug`. |

Gate order: maintenance → force update → onboarding (first launch) → login → tabs. The splash screen stays up until
the first decision is made.

## Security & error handling

- **Auth**: tokens only in `expo-secure-store` (never AsyncStorage or logs); Bearer auth with one single-flight
  refresh on `401` (`TOKEN_EXPIRED` or `UNAUTHORIZED`) and one retry. Logout, account deletion and refresh failure clear
  tokens, the query cache, per-user cached data and any pending sign-in. PKCE protects the `remi://` redirect.
- **Links**: everything from content or the network (banners, markdown, notification payloads, OS deep links via
  `src/app/+native-intent.tsx`) passes `src/utils/safeUrl.ts` — an allowlist of internal routes (UUID / slug checked)
  plus `https:`. Other schemes and malformed input are dropped and logged at debug level. Markdown never renders raw HTML.
- **Config**: validated with zod and merged field by field onto bundled defaults (hex colours, clamped radius, enums,
  https URLs, readable primary foreground). A malformed config can't crash the app or produce an unreadable theme.
- **Platform**: Android `allowBackup: false`, cleartext only in development, unused permissions blocked; iOS ATS
  local networking only in development, `ITSAppUsesNonExemptEncryption: false`, no unused usage strings.
- **Errors**: `ApiError` (status, code, message, details, requestId) and one `getErrorMessage()` (offline, timeout,
  rate/plan limits, upstream, maintenance; 5xx show generic copy + `Ref: <requestId>`). 15 s request timeout (Ask AI
  60 s). TanStack Query: no retries on 4xx, up to 2 backoff retries on network/5xx/502; queries pause while offline
  (NetInfo → `onlineManager`) with an offline banner; mutation errors toast globally unless the screen shows its own
  (forms map `VALIDATION_ERROR` details onto fields).
- **Crashes & logging**: branded `ErrorBoundary` at the root and key routes (with a reference id for API errors).
  `src/utils/logger.ts` gates debug output on `__DEV__`, redacts sensitive keys, and routes everything through one
  `reportError(error, context)` hook — a no-op today, ready for Sentry via `setErrorReporter`.

## Project layout

```text
src/app/          expo-router routes only (thin files re-exporting screens) + +native-intent deep-link filter
src/api/          typed client (envelope, Bearer auth, single-flight refresh), resources, query hooks, query keys
src/providers/    config (cache + ETag + zod validation + maintenance), auth, onboarding
src/theme/        palette derivation, tokens, elevation, ThemeProvider
src/components/   UI kit (Touchable, Button, Card, ActionSheet, DateTimeField, SwipeRow, …), Markdown, Logo, Icon map
src/features/     screens and feature logic (home, meetings, meeting-detail, reminders, action-items, ask, …)
src/hooks/        shared hooks (useNow, useRefreshControl, useDebouncedValue)
src/utils/        env, logger, safeUrl/links, formatting, semver, storage, haptics, validation
```
