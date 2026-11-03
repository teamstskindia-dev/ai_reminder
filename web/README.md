# Remi — website

The public marketing site and the signed-in web app for Remi, an AI meeting assistant
(Google sign-in, Calendar sync, a Google Meet notetaker, AI meeting reports, Ask-AI, analytics and reminders).

All user-visible content comes from the backend's public config. That covers branding, logos, colours,
font, landing sections, navigation, banners, plans, CMS pages, feature flags and SEO, and it is edited
in the admin panel. None of it is hard-coded here. The only bundled copy is a fallback that mirrors
`backend/supabase/seed.sql`, used when the API is unreachable.

- **Stack:** Next.js 16 (App Router, Cache Components, Partial Prefetching, Turbopack), React 19,
  TypeScript (strict), Tailwind CSS 4, shadcn/ui (Radix), TanStack Query, react-hook-form + zod,
  recharts, date-fns, sonner, next-themes, react-markdown + remark-gfm, socket.io-client.
- **Contract:** [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md) (binding) ·
  **Design:** [`../docs/HLD.md`](../docs/HLD.md)

## Setup

```bash
cd web
cp .env.example .env.local   # adjust if the API is not on :4000
npm install
npm run dev                  # http://localhost:3000
```

The backend API should be running on `NEXT_PUBLIC_API_URL`. It isn't required, though: without it, public
pages render from the bundled fallback config, and signed-in pages show an error state with a retry button.

## Environment

| Variable | Example | Used by |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Browser API calls (`/api/v1` is appended), Socket.IO, Google sign-in redirect |
| `API_URL_INTERNAL` | `http://localhost:4000` | Server-side fetches of public config, sections, plans and pages (can be an internal hostname) |
| `REVALIDATE_SECRET` | `change-me` | `POST /api/revalidate`; must equal the backend's `WEB_REVALIDATE_SECRET` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | `metadataBase`, Open Graph URLs, sitemap |

`NEXT_PUBLIC_*` values are inlined at build time, so rebuild after changing them.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build (succeeds with the API offline) |
| `npm run start` | Serve the production build on port 3000 |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript + React Compiler rules) |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |

## Structure

```text
src/
  proxy.ts                      route protection (Next 16 "proxy", formerly middleware)
  app/
    layout.tsx                  root: config → CSS variables, Google Font <link>, metadata, providers
    (marketing)/                header + footer layout; / (landing), /pricing
    (cms)/p/[slug]/             CMS markdown pages (fully static, real 404 for unknown slugs)
    (auth)/login/               split-screen sign-in (content from sections?page=login)
    auth/google/route.ts        starts Google OAuth (stores ?next= in a short-lived cookie)
    auth/callback/              exchanges the one-time code, routes new vs returning users
    (app)/                      signed-in app shell + dashboard, analytics/reports, analytics/reports/[id],
                                analytics/overview, calendar, action-items, reminders, ask, notifications, settings
    api/revalidate/route.ts     on-demand revalidation webhook
    robots.ts, sitemap.ts
  components/
    ui/                         shadcn/ui primitives
    brand/                      <Logo> (image with letter-mark fallback), <SafeImage>
    marketing/                  header, footer, banner strip, section renderer + one component per section type
    layout/                     app shell, sidebar, top bar, search, notifications bell, user menu, maintenance
    meetings/                   status chip, score ring, report rows, dialogs (add / upload / welcome), report detail tabs
    action-items/ reminders/ analytics/ ask/ notifications/ settings/ integrations/ dashboard/ calendar/ common/
  hooks/queries/                TanStack Query hooks per resource (optimistic updates for toggles and check-offs)
  lib/
    api/                        types.ts (mirrors the contract), client.ts (fetch wrapper), one module per resource
    config/                     defaults.ts (seed mirror), normalize.ts, server.ts ('use cache' readers), theme.ts
    query-keys.ts               single query-key factory
    icons.tsx                   contract IconKey → lucide icon (with a fallback)
    logger.ts                   sanitising logger + reportError() hook
    safe-url.ts, safe-next.ts   URL allow-list and post-login redirect validation
    form-errors.ts              VALIDATION_ERROR details → react-hook-form fields
    env.ts / env.server.ts      client-safe vs server-only ('server-only') environment access
    format.ts, meeting.ts, routes.ts
  providers/                    config, query, theme (next-themes), realtime (Socket.IO)
```

## How it works

### Public config and caching

`lib/config/server.ts` reads `/public/config?platform=web`, `/public/sections`, `/public/plans` and
`/public/pages/:slug` from the server. Each reader is a `'use cache'` function with
`cacheTag('config', …)` and `cacheLife({ revalidate: 300 })`. Under Cache Components this is the
equivalent of `fetch(…, { next: { revalidate: 300, tags: ['config'] } })`. Narrower tags also exist:
`sections`, `sections:<page>`, `plans`, `pages` and `page:<slug>`.

If the API can't be reached (for example during `next build` with the backend offline), the readers return
`lib/config/defaults.ts` with a 60-second lifetime, so live content replaces it soon after the API is back.
Every field is normalised (`normalize.ts`), so a missing or malformed admin value falls back to the default
and never crashes a page. The root layout passes the config to client components through `ConfigProvider`
(`useConfig`, `useBranding`, `useFeature`, `useNavigation`, `useBanners`).

### Theme

`lib/config/theme.ts` turns `config.theme` into CSS custom properties that the root layout renders in a
`<style>` tag. These drive every Tailwind/shadcn token:

- `--primary` and `--primary-foreground`
- `--brand-accent`
- `--sidebar*`
- `--radius`
- `--app-font`
- the chart palette, plus derived values such as `--ring`, `--accent` and `--brand-soft`

Changing the colour in the admin re-skins the whole site. Values are sanitised before they are inlined.
`theme.fontFamily` is loaded with a Google Fonts `<link>`, because `next/font` needs build-time names.
Light/dark mode uses next-themes and defaults to `theme.defaultMode`.

### On-demand revalidation

After an admin edit the backend calls:

```bash
curl -X POST http://localhost:3000/api/revalidate \
  -H 'x-revalidate-secret: change-me' -H 'content-type: application/json' \
  -d '{"tags":["config"]}'
```

Each tag is expired with `revalidateTag(tag, { expire: 0 })` (Next 16 signature), so the next request
renders fresh content. A wrong secret returns `401`, and a body with no valid tags returns `400`.

### Auth

The website never sees tokens. The API sets the httpOnly cookies `remi_at` and `remi_rt`.

- **Sign-in flow:** `/login` → `/auth/google?next=…` → API `/auth/google?platform=web` → Google → API →
  `/auth/callback?code=…` → `POST /auth/exchange`. New users then go to
  `/analytics/reports?action=welcomeCalendarSuccess`; returning users go to `next` or `/dashboard`.
- **Route protection:** `proxy.ts` sends app routes without the `remi_rt` cookie to `/login?next=…`, and
  sends `/login` to `/dashboard` when the cookie exists.
- **API client:** `lib/api/client.ts` unwraps the envelope and throws a typed `ApiError`. On a `401`
  (`TOKEN_EXPIRED` or `UNAUTHORIZED`) it makes one single-flight `POST /auth/refresh` and retries once.
  This never happens for the refresh, exchange or logout calls, or for a request that is already a retry.
  If the refresh fails, it clears the query cache and redirects to `/login?next=…&reauth=1`. `reauth`
  stops the proxy from bouncing back to `/dashboard` while a stale cookie is still present.
- **Sign-out:** `POST /auth/logout`, then a full navigation to `/`.

### Signed-in app

Pages are client-rendered with TanStack Query, and the cookies are sent automatically. The shell renders a
static skeleton on the server, then the real UI after hydration. That keeps clock-dependent formatting out
of the prerender, which Cache Components forbids.

- **Realtime:** `RealtimeProvider` opens one Socket.IO connection (`/realtime`, `withCredentials`).
  - `notification:new` → toast, and refreshes the notifications list and unread count.
  - `meeting:updated` → patches and refreshes the meeting queries.
  - `reminder:fired` → toast.
  - If the connection fails with an auth error, it refreshes once and reconnects.
- **Feature flags:** the API already filters the navigation. `lib/routes.ts` also guards the routes, and a
  disabled feature shows a "This feature is turned off" state.
- **Maintenance:** a `MAINTENANCE` error, or `app.maintenanceMode` in the config, shows a full-page
  maintenance screen with `app.maintenanceMessage`.

## Security & error handling

### Errors

- **API errors:** `ApiError` carries `status`, `code`, `message`, `details` (validation issues) and
  `requestId`. The request id comes from the error body or the `X-Request-Id` header.
- **User-facing copy:** `getErrorInfo()` and `getErrorMessage()` map error codes to friendly copy.
  - Offline and network failures.
  - `RATE_LIMITED`, using `Retry-After` when present.
  - `PLAN_LIMIT_REACHED`, with a "See plans" link to `/pricing`.
  - `UPSTREAM_ERROR` ("try again").
  - `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` and `MAINTENANCE`.
  - Raw server text is never shown for a 5xx error. Instead the user sees generic copy and
    "Reference: {requestId}".
- **Error boundaries:**
  - `error.tsx` for the `(app)`, `(marketing)` and `(cms)` groups, the report detail page and Ask AI.
  - The root `error.tsx` and `global-error.tsx`.
  - A branded `not-found.tsx`.
  - Each boundary offers "Try again" and shows the reference id (request id or Next's digest).
- **TanStack Query:**
  - Requests are never retried on 4xx. Network, 5xx and 502 failures are retried up to 2 times with
    exponential backoff.
  - Global `QueryCache` and `MutationCache` handlers log every failure.
  - Mutations get an error toast unless they are `meta: { silent: true }`, which forms and inline
    flows use because they show their own errors.
  - Forms map `VALIDATION_ERROR` details onto react-hook-form fields with `applyFieldErrors`.
- **Logging:** `src/lib/logger.ts` prints debug and info only in development, and warn and error always.
  - Context keeps primitive values only. Secret-like and personal keys are dropped, and token-like
    strings (JWTs, bearer tokens, long opaque strings, `?code=`) are redacted.
  - Request bodies, cookies and meeting content are never logged.
  - `reportError(error, context)` is the single hook point for Sentry (currently a no-op beyond logging).
  - The logger is used by the boundaries, the query caches, the realtime provider, route handlers and the
    config fetch.
- **Config fetch:** each request has a 3 s `AbortSignal` timeout. On failure it logs a warning and
  falls back to the bundled config. Normalisation is wrapped too, so config can never throw during a
  page render.
- **Uploads:** before sending, the client checks the file extension, MIME type, empty files and the
  contract size limits (audio 200 MB, transcripts 5 MB). The dialog shows progress and has a cancel
  button. `413` and `415` errors get clear messages.
- **Realtime:** if the connection fails with an auth error, the client refreshes once and reconnects.
  Other failures use socket.io's exponential backoff with jitter.
  - A server-initiated disconnect triggers a refresh and reconnect.
  - After a reconnect, notifications and meetings are refetched.
  - Toasts are de-duplicated by event and throttled to 3 per 10 s, followed by one summary toast.

### Security

- **Theme injection:** the `<style>` built from admin config only accepts:
  - `^#[0-9a-fA-F]{6}$` colours;
  - a finite radius clamped to 0–32;
  - a font family matching `^[A-Za-z0-9 \-]{1,64}$`;
  - an enum `defaultMode`.

  Anything invalid falls back to the default. The Google Fonts URL uses `encodeURIComponent`. The theme
  `<style>` is the only `dangerouslySetInnerHTML` in the app.
- **URL allow-list:** `safeUrl()` guards every link and image that comes from config, the CMS,
  notifications or meetings. That covers `SmartLink`, `SafeImage`, markdown, avatars, meeting links,
  metadata icons and the OG image.
  - Allowed: `/path` (not `//`), `#anchor`, `https:`, `mailto:`, and `http:` in development only.
  - Everything else is dropped.
  - External links get `target="_blank" rel="noopener noreferrer"`.
- **Markdown:** react-markdown runs without `rehype-raw`, so raw HTML is never rendered. Links and images
  go through `safeUrl`.
- **Open redirects:** `next` must match `^/(?!/)`, contain no backslashes or control characters, and not
  be `/auth/*` or `/login`. Otherwise it becomes `/dashboard`. This is enforced in `/auth/google`, on the
  login button and in the callback. The proxy only builds `next` from the current path.
- **`/api/revalidate`:**
  - POST only (any other method gets `405`).
  - Length-safe `crypto.timingSafeEqual` on the secret.
  - A bad secret gets `401` with no detail.
  - Body capped at 4 KB.
  - Tags restricted to an allowlist: `config`, `sections`, `pages`, `plans`, `sections:<page>` and
    `page:<slug>`.
  - Every request is logged.
- **Headers (`next.config.ts`):**
  - CSP with `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'` and `base-uri 'self'`.
  - `img-src` allows `'self' https: data: blob:`.
  - `connect-src` allows `'self'` plus the API origin and its `ws:`/`wss:` origin.
  - Google Fonts are allowed in `style-src` and `font-src`.
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
    `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`,
    `Cross-Origin-Opener-Policy: same-origin`, and `poweredByHeader: false`.
  - HSTS and `upgrade-insecure-requests` are added only for an https production `NEXT_PUBLIC_SITE_URL`.
- **CSP compromise:** `script-src` includes `'unsafe-inline'`. Next's inline hydration scripts and
  next-themes' anti-flash script need it. Nonce-based CSP would force every page to render dynamically,
  which disables the static and Partial Prerendering output this app relies on (see Next's CSP guide).
  `'unsafe-eval'` is only allowed in development.
- **Auth:**
  - Tokens live only in the API's httpOnly cookies. The token pair returned by `/auth/exchange` is
    ignored, and nothing goes into JS-accessible storage.
  - Logout and session failure clear the query cache.
  - Account deletion requires typing `DELETE`.
  - The proxy treats cookie presence as a UX hint only. The API's `401` is the real check.
- **Environment:** only `NEXT_PUBLIC_*` values are read in client code (`lib/env.ts`).
  `API_URL_INTERNAL` and `REVALIDATE_SECRET` are read in `lib/env.server.ts`, which imports
  `server-only`. `.env.example` contains no secrets.
- **Dependencies:** `npm audit --omit=dev` reports 0 vulnerabilities. The remaining advisories are
  moderate or low, in dev-only tooling (the `shadcn` CLI and `@tailwindcss/typography`'s
  `postcss-selector-parser`), and their only fixes are breaking downgrades.
