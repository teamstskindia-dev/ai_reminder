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

**Release consideration (iOS):** App Store Review Guideline 4.8 may require offering **Sign in with Apple** when an app
offers Google sign-in. It is not implemented — decide before submitting to the App Store.

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
