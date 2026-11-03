# Remi — Admin panel

The operator console for Remi. Everything users see on the **website** and the **Android app** is managed
here: brand, theme, landing-page sections, CMS pages, navigation, banners, plans, mobile onboarding, feature
flags, maintenance mode and app versions, SEO, AI models and prompts, meeting-bot behaviour (including the
Google Meet DOM selectors), notification templates and broadcasts — plus operations: users, meetings, queues,
audit logs and admin accounts.

The binding API contract is [`docs/API_CONTRACT.md`](../docs/API_CONTRACT.md) §5 (Admin API). The architecture is
described in [`docs/HLD.md`](../docs/HLD.md).

## Stack

Next.js 16 (App Router, Turbopack, Cache Components, `proxy.ts`), React 19, TypeScript (strict), Tailwind CSS 4,
shadcn/ui (Radix, "nova" preset), lucide-react, TanStack Query + TanStack Table v8, react-hook-form + zod 4,
recharts, date-fns, sonner, next-themes, dnd-kit, react-markdown + remark-gfm.

## Setup

```bash
cd admin
cp .env.example .env.local      # adjust if the API/website run elsewhere
npm install
npm run dev                     # http://localhost:3001
```

The admin is a pure client of the API — start the backend (`http://localhost:4000`) to sign in. The first
super admin is created by the API on boot from `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`.

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | API origin; the client appends `/api/v1`. |
| `NEXT_PUBLIC_WEB_URL` | `http://localhost:3000` | Website origin for "View on site" links and previews. |

Both are inlined at build time — rebuild after changing them. The API must list the admin origin in
`CORS_ORIGINS` (credentials are sent), and in production admin + API must share a cookie domain
(`COOKIE_DOMAIN=.example.com`) so the route guard can see the refresh cookie.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3001 |
| `npm run build` | Production build |
| `npm run start` | Serve the build on port 3001 |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript + React Compiler hook rules) |
| `npm run typecheck` | `tsc --noEmit` |

## How it works

- **API client** (`src/lib/api/client.ts`): `fetch` to `${NEXT_PUBLIC_API_URL}/api/v1` with
  `credentials: 'include'`, unwraps the `{ success, data, meta }` envelope and throws a typed `ApiError`
  (`status`, `code`, `message`, `details`, `requestId`). On `401` it performs **one single-flight**
  `POST /admin/auth/refresh` shared by all concurrent requests, retries once, and otherwise redirects to
  `/login?next=…`. Network failures become `NETWORK_ERROR` with a friendly message.
- **Resources** (`src/lib/api/*.ts`): one module per resource with typed functions + TanStack Query hooks.
  Keys come from the factory in `query-keys.ts`; mutations go through `useApiMutation`, which invalidates the
  right keys and toasts success/error. Validation `details` are mapped onto form fields with `applyApiErrors`.
- **Contract types** live in one file: `src/lib/api/types.ts`. Zod schemas in `src/lib/schemas/` are declared
  `satisfies z.ZodType<ContractType>`, so a drift from the contract is a compile error.
- **Auth**: `/login` posts to `/admin/auth/login`; the API sets httpOnly cookies `remi_admin_at` /
  `remi_admin_rt`. `src/proxy.ts` (Next 16's replacement for middleware) redirects every route except `/login`
  to `/login?next=` when the `remi_admin_rt` cookie is missing. `AdminSessionProvider` loads
  `GET /admin/auth/me` and exposes `can(role)` / `canEditSetting(key)`; `<RoleGate minRole>` hides or disables
  UI. The API enforces the same rules.
- **Cache Components** is enabled (Next 16 default). Pages are prerendered shells; data is fetched on the
  client. Components that read the URL (`usePathname`, `useSearchParams`, `useParams`) sit under `Suspense`
  boundaries in the admin shell.

## Roles

Hierarchy: `super_admin` > `admin` > `editor` > `viewer`. Viewers can open every screen read-only.

| Area | Minimum role to change |
| --- | --- |
| Sections, pages, navigation, banners, media | editor |
| Settings: branding, theme, SEO | editor |
| Settings: features, app, AI, bot, notifications | admin |
| Users (plan, status, name), meetings (reprocess, delete), plans, AI prompts & playground, notification templates, broadcasts, failed jobs, cache flush | admin |
| Audit logs (read) | admin |
| Admin accounts, deleting users | super_admin |

## Routes

| Group | Route | Notes |
| --- | --- | --- |
| Overview | `/` | KPIs, signups/meetings per day, queue health, quick links |
| People & data | `/users`, `/users/[id]` | Filters (search, status, plan), plan change, suspend/activate, delete (type-to-confirm) |
| | `/meetings`, `/meetings/[id]` | Filters (search, status, user, date range); report, action items, transcript, reprocess, delete |
| Content | `/content/sections`, `/content/sections/[id]` | Page + platform selector, drag-to-reorder, structured per-type forms, JSON tab, live preview |
| | `/content/pages`, `/content/pages/new`, `/content/pages/[id]` | Markdown CMS pages with SEO and "View on site" |
| | `/content/navigation` | Header / footer / sidebar / mobile tabs, drag-to-reorder |
| | `/content/banners` | Platform / placement / variant, schedule, live preview |
| | `/content/plans` | Pricing plans, limits (unlimited = `null`) |
| | `/content/media` | Media library: upload, alt text, copy URL, delete |
| Configuration | `/settings/branding`, `/settings/theme`, `/settings/features`, `/settings/seo` | Settings forms with previews |
| | `/ai`, `/ai/prompts`, `/ai/prompts/[key]`, `/ai/playground` | Model settings, prompt editor, test runner |
| | `/bot` | Bot behaviour + Google Meet selectors |
| | `/notifications`, `/notifications/templates`, `/notifications/templates/[key]`, `/notifications/broadcasts` | Delivery settings, templates with preview, broadcasts |
| System | `/system/queues`, `/system/audit-logs`, `/system/admins` | Queue stats (10 s refresh), failed jobs + retry, cache flush, audit diff, admin accounts |
| Account | `/profile`, `/login` | Name, avatar, password |

## How each setting reaches the website and the app

Every settings form loads `GET /admin/settings/:key` and saves the **full object** with
`PUT /admin/settings/:key`. The API invalidates its config cache and asks the website to revalidate; the app
refetches `GET /public/config?platform=mobile` on foreground (ETag/304).

| Key | Public | Website | Android app |
| --- | --- | --- | --- |
| `branding` | yes | Header/footer logos, app name, tagline, favicon, support email, copyright | Splash/header logo, app name, support links |
| `theme` | yes | CSS variables at the root layout (primary, accent, sidebar colours, radius, font, default mode) | Theme provider colours, radius, font, default mode |
| `features` | yes | Hides modules and nav items whose `requiredFeature` is off; `signupsEnabled` gates new Google sign-ups | Hides tabs/screens behind flags; push registration (`pushNotifications`) |
| `app` | yes | Maintenance message (API returns `503 MAINTENANCE` for user endpoints) | Maintenance screen; force-update below `minAppVersion`, update prompt below `latestAppVersion`, store links |
| `seo` | yes | Default `<title>`, description, keywords, Open Graph image | — |
| `ai` | no | — (backend: Gemini model, embeddings, temperature, token limit, output language) | — |
| `bot` | no | — (backend bot: name, timings, auto-join default, headless, Meet DOM selectors) | — |
| `notifications` | no | — (backend: push/email switches, sender, default reminder minutes, digest) | — |

Other content: **sections** (`/public/sections?page=…&platform=…` — landing, pricing, login on the web;
`mobile_onboarding` slides and `mobile_home` in the app), **navigation** (`header`/`footer` on the website,
`sidebar` in the web app, `mobile_tab` = the app's bottom tabs, in order), **banners** (`landing_top` and
`dashboard` on the web, `mobile_home` in the app), **plans** (`/public/plans`, pricing sections),
**CMS pages** (`/p/{slug}` on the website).

## Project structure

```text
src/
  proxy.ts                     route guard (remi_admin_rt cookie)
  app/
    layout.tsx                 fonts, providers (Query, theme, tooltips, toasts)
    (auth)/login/              sign-in page
    (admin)/layout.tsx         session provider + admin shell
    (admin)/…                  one folder per route: page.tsx (server, metadata) + *-view.tsx (client)
  components/
    ui/                        shadcn/ui primitives
    layout/                    shell, sidebar + nav config, breadcrumbs, admin menu, theme toggle
    auth/                      AdminSessionProvider, RoleGate
    common/                    PageHeader, ConfirmDialog, StatusBadge, Empty/Error states, SortableList,
                               RemoteImage, Markdown, UserPicker, SubNav, CopyButton
    data-table/                DataTable (URL-synced pagination/sorting), toolbar, pagination, search
    forms/                     FormField + Text/Textarea/Number/Switch/Select fields, ColorField, IconSelect,
                               TagInput, StringList, MarkdownEditor, JsonEditor, SliderField, FormSection,
                               SaveBar, settings form helpers
    media/                     ImageField, MediaPicker, MediaGrid, UploadDropzone
    sections/                  per-type section forms and previews
    previews/                  theme/branding preview helpers
    cms/, system/, charts/     page-group specific components
  hooks/                       URL state, debounce, unsaved-changes guard, mobile breakpoint
  lib/
    api/                       client, types (contract), query keys, mutation helper, one module per resource
    schemas/                   zod schemas mirroring SettingValue / SectionContent
    utils/                     cn + formatting helpers
    forms.ts, roles.ts         useZodForm/applyApiErrors, role hierarchy
```

## Security & error handling

### Errors

- **Typed errors** (`src/lib/api/errors.ts`): every failure is an `ApiError` with `status`, `code`, `details`,
  `requestId` (from the body or the `X-Request-Id` header) and `retryAfterSeconds` (from `Retry-After`).
  `getErrorMessage()` turns it into user-facing text:
  - 4xx: the API's message, which is safe to show.
  - `UPSTREAM_ERROR` (502): "The external service failed. Please try again."
  - 413 and 415 on uploads: the 10 MB limit and the allowed file types.
  - `RATE_LIMITED`: the wait time.
  - `FORBIDDEN`: "You don't have permission to do that."
  - 5xx: generic text only, never the server's text, plus a copyable **Reference** (`requestId`). Reference
    shows up in toasts, error states, confirm dialogs and boundaries.
- **TanStack Query** (`src/components/providers.tsx`):
  - Retries: no retry on 4xx. Network errors and 5xx (including 502) get up to 2 retries with exponential
    backoff. Mutations never retry.
  - A global `QueryCache`/`MutationCache` `onError` logs every failure. Mutation errors are toasted unless
    the caller handled them locally: an inline dialog error, or validation details that all landed on form fields.
  - A `FORBIDDEN` response refetches `/admin/auth/me`, so the UI re-checks role-based access when an admin's role changes.
- **Validation errors**: `applyFormErrors()` maps `details` (dot paths) onto react-hook-form fields. It handles
  bracket paths, nested arrays (`items.2.title`), settings paths prefixed with `value.`, and section content
  paths with or without the `content.` prefix.
- **Boundaries**:
  - `app/global-error.tsx` replaces the root layout when it crashes.
  - `app/error.tsx` covers the admin shell and the login page.
  - `app/(admin)/error.tsx` covers every page inside the admin shell.
  - Dedicated boundaries cover the section editor, meeting detail and AI playground.
  - Each boundary has *Try again*, *Reload* and a reference: the request id, the Next.js digest, or a stable
    hash of a client error.
  - Unknown URLs render an admin-styled 404 inside the shell (`app/(admin)/[...missing]`).
- **Logging** (`src/lib/logger.ts`): `debug`/`info` print only in development. `reportError(error, context)`
  is the single exit point for errors and is ready for Sentry via `setErrorReporter()`. API errors are logged
  as code, status and requestId only. Context keys that look sensitive (tokens, passwords, emails, names,
  content, search text) are redacted. Query keys are reduced to their resource name.

### Security

- **URL allow-list** (`src/lib/security/safe-url.ts`) applies to every URL rendered from data: images
  (`RemoteImage`, avatars, media grid, previews), links (`SafeLink`: "View on site", media originals, meeting
  links) and markdown (`urlTransform`).
  - Allowed: root-relative `/path` (not `//host` or `/\host`), `https:`, `http:` only in development,
    `mailto:`, and `remi://` (shown as text only, never a link).
  - Blocked: `javascript:`, `data:`, `vbscript:`, and anything with whitespace or control characters.
  - External links get `rel="noopener noreferrer"`.
- **Form validation** mirrors the API so mistakes are caught before saving:
  - The URL rules on every URL field. Mobile tabs take route names instead.
  - Hex colours `^#[0-9a-fA-F]{6}$` and font family `^[A-Za-z0-9 -]{1,64}$`.
  - Titles up to 300 characters, bodies up to 5,000, pages and rich text up to 200,000.
  - Meet selectors must be a single line of at most 2,000 characters.
  - The settings limits from `backend/src/modules/content/settings.schemas.ts`.
- **Previews** only apply colours and fonts after validation (`sanitizeTheme`/`themeVars`, `safeColor`), through
  inline style objects. No CSS strings are built from input and nothing uses `dangerouslySetInnerHTML`. Markdown
  renders with `skipHtml` and no `rehype-raw`.
- **Login**:
  - A generic "Invalid email or password." for every credential failure, so accounts cannot be enumerated.
  - Rate limiting shows a lockout with a countdown taken from `Retry-After`.
  - `autocomplete="username"`/`"current-password"`; the password field is cleared after a failed attempt and
    the submit button is disabled while pending.
  - `next` must match `^/(?![/\\])`, otherwise `/`.
- **Sessions**: logout, a failed refresh (before the redirect to `/login`) and a new login all clear the query
  cache. Refresh runs once per 401, is shared by concurrent requests, and is never triggered by auth endpoints or
  retried requests.
- **Uploads** are checked in the browser before sending: extension, matching MIME type, non-empty, ≤ 10 MB;
  types PNG, JPG, WebP, SVG, GIF, ICO. SVG is listed because the contract accepts it, and the API must sanitise it.
- **Headers** (`next.config.ts`):
  - Content Security Policy:
    - Sources: `default-src 'self'`; `img-src 'self' https: data: blob:`; `connect-src 'self' <API origin>`.
    - Lockdowns: `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` and `form-action 'self'`.
    - Google Fonts are allowed only for the theme preview.
    - Scripts use `'unsafe-inline'`, because nonces would make every page dynamically rendered; `'unsafe-eval'`
      is added only in development.
  - Other headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, a restrictive
    `Permissions-Policy`, COOP/CORP `same-origin`, HSTS and `upgrade-insecure-requests` for production builds whose API URL is https
    (skipped for a local `npm run start` against `http://localhost`), and `X-Robots-Tag: noindex, nofollow`.
    `poweredByHeader` is off.
- **Not indexed**: `public/robots.txt` disallows everything, the metadata sets `robots: noindex`, and the
  `X-Robots-Tag` header is sent on every response.
- **Dependencies**: `npm audit --omit=dev` reports 0 vulnerabilities. The `shadcn` CLI is a devDependency;
  its CSS import is only needed at build time. Remaining advisories are dev-only and moderate/low: `deepmerge`
  through the shadcn CLI, and `minimatch` through `ts-morph`. Their only fixes are breaking downgrades.

## Notes and limitations

- Image fields accept any pasted URL; uploads go to `POST /admin/media/upload` (Cloudinary). With the dummy
  development credentials uploads may fail — paste a URL instead.
- Unsaved-changes protection covers reloads/closing the tab and in-app link clicks; the browser back button is
  not intercepted (the App Router has no blocking navigation API).
- Previews (theme, branding, sections, banners, templates, SEO) are close approximations of the website and app,
  not pixel-identical renders.
- The panel's own look is fixed and neutral; it previews the brand theme but never re-skins itself.
