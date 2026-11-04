# Remi backend

NestJS 11 (TypeScript strict) backend for Remi, the AI meeting assistant. One codebase, three processes:

| Process  | Entrypoint      | What it does                                                                     |
|----------|-----------------|-----------------------------------------------------------------------------------|
| `api`    | `src/main.ts`   | REST API `/api/v1`, Swagger `/docs`, Socket.IO `/realtime`, OAuth; enqueues jobs |
| `worker` | `src/worker.ts` | BullMQ processors: `calendar-sync`, `ai-processing`, `notifications`, `digest` + repeatable jobs |
| `bot`    | `src/bot.ts`    | BullMQ `meeting-bot` processor: Chromium joins Google Meet and captures live captions |

Stack: Prisma 7 ORM on Supabase Postgres (+ pgvector), Supabase Storage (recordings only), Redis (BullMQ, cache,
rate limits, Socket.IO adapter), Gemini (`@google/genai`), Google OAuth + Calendar, Cloudinary, Expo push, SMTP.
The contract with the clients is `docs/API_CONTRACT.md`; the design is `docs/HLD.md`.

```
src/
  main.ts worker.ts bot.ts            entrypoints;  api.module / worker.module / bot-app.module / core.module
  config/                             zod-validated env (fails fast; stricter in production)
  common/                             errors + global filter, envelope, guards, request context, logging, validators, files
  infra/                              prisma, redis, queue (BullMQ base processor), gemini, google, storage, cloudinary,
                                      mail, push, realtime (Redis emitter + adapter), external-call wrapper
  modules/  auth users integrations calendar meetings bot ai assistant action-items reminders notifications
            devices dashboard analytics content public media admin health
  generated/prisma                    Prisma client (generated, git-ignored)
prisma/
  schema.prisma  migrations/  seed.sql
```

## 1. Setup

Requirements: Node ≥ 22.12 (24 LTS recommended), npm, Redis 7, Postgres 15+ with `pgvector` (Supabase has it).

```bash
cd backend
npm install                 # postinstall runs `prisma generate`
cp .env.example .env        # then edit (see below)
```

### Database: local in development, Supabase in production

**Development always uses a local Postgres** (pgvector). From the repo root, `docker compose up -d postgres redis`
publishes it on `localhost:5433` (5433 avoids clashing with a Homebrew Postgres on 5432); `backend/.env.example`
already points `DATABASE_URL`/`DIRECT_URL` there. Inside the compose stack the containers use `postgres:5432`.
Uploads (Supabase Storage) are disabled locally; everything else works.

**Supabase is production-only, and this is enforced.** With `NODE_ENV=development` or `test`, both the API boot
(`src/config/database-target.ts`) and the Prisma CLI (`prisma.config.ts`) refuse a `*.supabase.co` / `*.supabase.com`
host, so a local migrate or seed can never touch production. The deliberate override is `ALLOW_REMOTE_DB_IN_DEV=true`.

**Production** (`backend/.env.production.example` → `/opt/remi/.env.production` on the VPS):

- `DATABASE_URL` = the Supabase **transaction pooler** (port **6543**) with `?sslmode=require&uselibpqcompat=true`.
  `@prisma/adapter-pg` never uses named prepared statements, so no `pgbouncer=true` flag is needed.
- `DIRECT_URL` = the **session pooler** (port **5432**, IPv4). Only the Prisma CLI uses it, in the `migrate` container.
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (Project settings → API keys): Storage only. The API creates the
  private `recordings` bucket on boot.

See [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for the release pipeline.

Apply the schema and the default content:

```bash
npm run prisma:migrate      # prisma migrate deploy (uses DIRECT_URL)
npm run db:seed             # prisma db execute --file ./prisma/seed.sql (settings, plans, CMS, prompts, templates)
```

The first super admin is created on API boot from `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` when `admins` is empty.

### Google OAuth client

Google Cloud Console → *APIs & Services*:

1. Enable **Google Calendar API**.
2. *OAuth consent screen*: External, add scopes `openid`, `email`, `profile`,
   `https://www.googleapis.com/auth/calendar.events.readonly` (a *sensitive* scope: while unverified, add your
   accounts as test users — max 100).
3. *Credentials → Create OAuth client ID → Web application*, authorised redirect URI exactly:
   `http://localhost:4000/api/v1/auth/google/callback` (production: `https://api.example.com/api/v1/auth/google/callback`).
4. Put the id/secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, the URI in `GOOGLE_REDIRECT_URI`.

The backend runs the whole OAuth exchange (offline access + consent, PKCE with Google) and redirects to
`{WEB_URL}/auth/callback?code=…` (web) or the allow-listed mobile `redirectUri` (mobile, with app ↔ API PKCE).

### Gemini, Redis, the rest

- `GEMINI_API_KEY` from Google AI Studio. Model names/temperature come from `app_settings.ai` (admin panel), never code.
  `AI_MOCK=true` gives deterministic fake reports/embeddings/answers so the full pipeline runs without a key.
- `REDIS_URL` (e.g. `docker compose up -d redis` → `redis://localhost:6379`).
- Cloudinary dummy values (`demo`/`dummy`) disable admin uploads (`400 Cloudinary is not configured`); pasted https
  image URLs still work. SMTP and Expo are optional.

Every variable is documented in [`.env.example`](./.env.example) and validated at boot (`src/config/env.schema.ts`).

## 2. Scripts

| Script | |
|---|---|
| `npm run build` | `nest build` (Swagger CLI plugin enabled) |
| `npm run start:api` / `start:worker` / `start:bot` | run the compiled processes (`node dist/*.js`) |
| `npm run start:dev` / `start:dev:worker` / `start:dev:bot` | watch mode |
| `npm run lint` / `lint:check` / `format` | ESLint (type-checked rules) + Prettier |
| `npm test` | Jest unit tests |
| `npm run openapi:check` | build the OpenAPI document (no DB/Redis/env needed) and fail on gaps; runs in CI after `build` |
| `npm run openapi:generate` | same check, then write `../docs/openapi.json` (for Postman or client codegen) |
| `npm run prisma:generate` | generate the client into `src/generated/prisma` |
| `npm run prisma:migrate` | `prisma migrate deploy` |
| `npm run prisma:migrate:dev` | `prisma migrate dev` (needs `SHADOW_DATABASE_URL`; see Prisma notes) |
| `npm run db:seed` | run `prisma/seed.sql` (once, on an empty database) |
| `npm run db:seed:if-empty` | seed only when `app_settings` is empty (what the `migrate` container does) |

## 3. Running

```bash
npm run build
npm run start:api      # http://localhost:4000/api/v1 , Swagger http://localhost:4000/docs
npm run start:worker
npm run start:bot      # BOT_MODE=simulate writes a sample transcript; BOT_MODE=puppeteer drives Chromium
```

### API docs (Swagger)

Swagger UI is at `/docs`, and the spec is at `/docs-json` and `/docs-yaml`. The spec is generated from the code
(`src/openapi.ts`), so it can't drift from the routes:

- **Requests**: DTOs in `*.dto.ts` files are read by the Swagger CLI plugin (types, `?` → optional, `| null` →
  nullable, class-validator rules → min/max/length/pattern/enum, JSDoc → descriptions). A DTO outside a `*.dto.ts`
  file shows up empty, and `openapi:check` fails. Use `@IsDateTime()` for timestamps (it validates and documents
  `date-time`) and `@ApiInteger()` next to `@IsInt()`. Settings values and CMS section content are documented from
  their zod schemas (`content.openapi.ts`).
- **Responses**: each route declares `@ApiOperation({ summary })` and `@ApiDataResponse(Model)` /
  `@ApiPaginatedResponse(Model)` (the `{ success, data, meta? }` envelope), or `@ApiNoContentResponse()`. Response
  models live in `*.responses.dto.ts` and `implements` their type from `common/types/api.types.ts`, so a
  contract change that isn't mirrored fails to compile.
- **Errors** are added automatically (`common/swagger/openapi-finalize.ts`): 401 for `@UserAuth`/`@AdminAuth`,
  403 and the minimum role for admin routes, 400 for routes with a body or query, 429, 503 unless
  `@MaintenanceExempt`, and 500. Each comes with an example per error code. List anything else the handler can throw
  with `@ApiErrors('NOT_FOUND', 'CONFLICT', …)` (once per handler).

Local real-Meet testing needs Chrome/Chromium: set `CHROME_PATH` (macOS:
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`) and `BOT_MODE=puppeteer`.

### Docker (one image, one compose project)

Everything runs from a **single image, `remi-backend:latest`**, built once from `backend/Dockerfile`; every
container belongs to the `remi` compose project. The image's entrypoint picks the process from its first argument
(or `REMI_PROCESS`): `api` (default) · `worker` · `bot` (`xvfb-run -a node dist/bot.js`) · `migrate`
(`prisma migrate deploy`, then seeds an *empty* database when `SEED_ON_MIGRATE=true`, the default).

```bash
# from the repo root
cp backend/.env.example backend/.env

docker compose up -d --build                      # postgres :5433, redis, migrate (one-off), api :4000, worker, bot
```

- Only the `migrate` service has a `build:` section (`image: remi-backend:latest`); `api`, `worker` and `bot` use
  the same image (`pull_policy: never`) and start after `migrate` exits 0 and Redis is healthy.
- Host ports: API `${API_PORT:-4000}`, Redis `${REDIS_PORT:-6379}`, Postgres `${POSTGRES_PORT:-5433}`, so you can
  also run `npm run start:*` on the host against the compose Redis/Postgres (the `localhost` URLs in `.env`).
- Local development has no Supabase Storage: uploads are disabled (the API logs a warning on boot).
- Production uses `deploy/docker-compose.prod.yml` (shipped inside the image) on the VPS; see docs/DEPLOYMENT.md.
- Image layout: `deps` (npm ci + prisma generate) → `build` (nest build) → `prod-deps` (npm prune + trimming of
  source maps, typings, TypeScript and non-Postgres Prisma engines) → `runtime`: node:24-bookworm-slim, tini,
  Debian `chromium` + Xvfb + fonts, prod `node_modules` (incl. the Prisma CLI), `dist`, `prisma/`; non-root `node`.
- Run a one-off command in the image: `docker compose run --rm migrate node_modules/.bin/prisma migrate status`.

## 4. Prisma notes (v7)

- Generator `prisma-client` with `moduleFormat = "cjs"`, output `src/generated/prisma` (compiled with the app).
- `prisma.config.ts` holds the CLI datasource (`DIRECT_URL`, falling back to `DATABASE_URL`) and the seed command.
  Runtime connections use `PrismaClient({ adapter: new PrismaPg(...) })` — no Rust query engine, no `binaryTargets`.
- `schema.prisma` mirrors the SQL exactly (`@@map`/`@map`, `@db.Uuid`, `@db.Timestamptz(6)`, numeric precision,
  `text[]`, `Json`, `onDelete` + `onUpdate: NoAction`). Status columns are `String` (CHECK constraints live in SQL)
  with string-literal unions in the domain layer.
- SQL-only (kept in the migrations): RLS, `updated_at` triggers, CHECK constraints, partial/expression/trigram/HNSW
  indexes, `match_meeting_chunks`, `dashboard_home_stats`, `analytics_overview`, `admin_dashboard_stats`.
  `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma` reports only
  `DROP INDEX meeting_chunks_embedding_idx` (the HNSW index on the `Unsupported("vector(768)")` column).
  **When using `prisma migrate dev`, create migrations with `--create-only` and delete that `DROP INDEX` line.**
- Raw SQL only through tagged templates (`$queryRaw`, `Prisma.sql`); embeddings are written with
  `$executeRaw ... ::extensions.vector`. `*Unsafe` raw APIs are never used.

## 5. Queues

| Queue | Producer | Consumer | Job id | Retries |
|---|---|---|---|---|
| `calendar-sync` | repeatable `sync-all` (every `CALENDAR_SYNC_INTERVAL_MINUTES`), login, manual sync | worker | `sync-{userId}` | 3, exp 30s |
| `meeting-bot` | calendar sync, `POST /meetings/:id/bot/join`, manual meetings | bot | `bot-{meetingId}` | 1 |
| `ai-processing` | bot, uploads, reprocess | worker | `ai-{meetingId}` | 5, exp 60s |
| `notifications` | reminders (delayed), AI, admin broadcasts | worker | `reminder-{id}` / `broadcast-{id}` / auto | 3, exp 10s |
| `digest` | repeatable hourly tick → `digest-{yyyyMMddHH}` | worker | — | 2 |

Rescheduling = remove the existing (non-active) job, then add. Completed jobs are trimmed (1000); failed jobs are
kept 7 days and can be listed/retried in *Admin → System*. Every job carries the `correlationId` of the request
that created it.

## 6. Meeting bot caveats

- The bot joins **as a guest** named `user_settings.bot_name` (or `app_settings.bot.botName`); the host must admit it.
  It waits in the lobby (`waiting_room`) for `waitingRoomTimeoutMinutes`, then fails with `admission: …`.
- Transcripts come from **Meet's live captions** (no audio is recorded); caption language follows the meeting.
- Meet's DOM changes over time: every selector and button text lives in `app_settings.bot.selectors` and can be
  hot-fixed from the admin panel without a deploy. No stealth/anti-detection tricks are used.
- It leaves when the call ends, it is denied/removed, it is alone for `leaveWhenAloneMinutes`, at
  `maxDurationMinutes`, when the user presses *leave*, or on SIGTERM — always saving captured segments first.
- Only `https://meet.google.com/xxx-xxxx-xxx` links are joined; each job uses a fresh temporary browser profile.

## 7. Security

- **Config**: zod-validated env; in production boot fails on example/weak JWT, admin-JWT or OAuth-state secrets
  (< 32 chars, placeholders, or equal to each other), a non-32-byte or example `ENCRYPTION_KEY`, `COOKIE_SECURE=false`,
  `AI_MOCK=true`, `exp://` in the mobile allowlist, or `*` in `CORS_ORIGINS`.
- **HTTP**: helmet, `x-powered-by` off, strict CORS allowlist with credentials, `TRUST_PROXY` for real client IPs,
  1 MB JSON body limit, Swagger only when `SWAGGER_ENABLED` (default on in dev, off in prod).
- **Auth**: HS256-pinned JWTs with `iss`, `aud` (users vs admins) and `typ` verified, separate secrets (a user token
  never passes the admin guard). Opaque refresh tokens (256-bit, SHA-256 at rest) rotated on every use inside a DB
  transaction; reuse of a rotated token revokes the family and logs a `security` event. Logout revokes; suspending a
  user revokes their sessions and cancels scheduled bots.
- **OAuth**: signed 10-minute `state` (platform, redirect URI, PKCE challenge, nonce); mobile `redirectUri` must match
  the allowlist by exact scheme/host/path-prefix; PKCE S256 between app and API (verified at `/auth/exchange`, a
  failure burns the code and is logged) and between API and Google; one-time codes are single-use (`GETDEL`, 60 s).
- **Admins**: bcrypt cost 12; per-IP and per-email lockout (5 failures / 15 min → 15 min, `429` + `Retry-After`);
  unknown emails are compared against a dummy hash; sessions revoked on password, role or status change; the last
  active super admin cannot be demoted/disabled/deleted and nobody can delete themselves; every mutation is audited
  (`audit_logs` with admin, action, entity, sanitized diff, IP, user agent).
- **Authorization**: every user query is scoped by `userId` in the repository; other users' resources return `404`;
  UUID params use `ParseUUIDPipe`. Socket.IO authenticates the handshake (cookie or `auth.token`), the server assigns
  the `user:{id}` room, CORS allowlist on the gateway, sockets drop when the token expires.
- **Input**: class-validator on every DTO with length caps (titles 300, bodies 5000, questions 2000, pages 200k),
  enums, ISO dates and pagination caps; zod for settings and section content. Admin URLs must be `https:`, `/path`,
  `mailto:` or `remi://` (`javascript:`/`data:` rejected); hex colours `#RRGGBB`; font names `[A-Za-z0-9 -]`; bot
  selectors single-line ≤ 1000 chars; the bot only accepts strict Meet URLs.
- **Uploads**: real type from magic bytes (`file-type`) against an allowlist, size limits (audio 200 MB, transcripts
  5 MB as UTF-8 text, images 10 MB), server-generated storage names; SVG is rejected.
- **Output**: email variables are HTML-escaped and markdown is rendered with raw HTML disabled and safe links only;
  transcripts/excerpts are delimited as untrusted data in prompts; model output is schema-validated, never executed.
- **Secrets at rest**: Google tokens AES-256-GCM encrypted; Supabase service key server-side only; constant-time
  comparisons for PKCE and other secrets.
- `npm audit --omit=dev`: 0 known vulnerabilities (transitive `multer` and `js-yaml` pinned via `overrides`).

## 8. Error handling & logging

- Services throw typed `AppException`s (`NotFoundError`, `ConflictError`, `PlanLimitReachedError`, `UpstreamError`, …).
  One global filter (plus an Express handler for body-parser errors) produces the contract `ApiError`
  (`requestId` always set): validation → `VALIDATION_ERROR` with `{field, messages}[]`, zod → `value.`-prefixed
  fields, Prisma `P2002` → 409 naming the field, `P2025` → 404, `P2003` → 409, other Prisma errors → 500, multer →
  413/415, throttler → 429 + `Retry-After`, expired JWT → `TOKEN_EXPIRED`, anything else → 500 with a generic
  message. Stack traces, SQL, Prisma messages and provider bodies never reach clients.
- Logs: pino (JSON in production, pretty in dev, `LOG_LEVEL`). 5xx at `error` with stack and cause chain; 401/404 at
  `debug`; other 4xx at `warn` — each with requestId, method, route, userId/adminId, status, code. Redaction covers
  authorization/cookie headers, passwords, tokens, auth codes, PKCE verifiers, API keys and encrypted token fields
  (depth ≤ 3). Transcripts, summaries, prompts and message bodies are never logged (ids/lengths only).
- `X-Request-Id`: accepted if sane, otherwise generated; echoed on every response and bound to every log line
  (AsyncLocalStorage); copied into BullMQ jobs as `correlationId` so api → worker → bot logs share it.
- External calls (Google, Gemini, Cloudinary, Expo, SMTP, Storage) go through `callExternal`: per-attempt timeouts,
  jittered exponential retries only for retryable failures (network, 408/429, 5xx), mapping to `UPSTREAM_ERROR`, and
  logs with provider/operation/latency/status/attempt. A revoked Google grant (`invalid_grant`) disconnects the
  calendar, records `sync_error` and notifies the user instead of retrying.
- Gemini: JSON mode + `responseSchema`, zod validation, one repair attempt, explicit safety-block/empty-candidate
  handling, transcripts capped (head + tail kept, logged).
- BullMQ: a shared `BaseProcessor` logs start/complete/fail with queue, job id, attempt, duration and correlationId,
  converts permanent errors into `UnrecoverableError`, listens to `failed`/`error`/`stalled`, and runs a final-failure
  hook (meeting `failed` + `failure_reason`, reminder `failed` + `failure_reason`, user notified where relevant).
- Bot steps are named (`navigate`, `prejoin`, `join`, `admission`, `captions`, `capture`, `leave`) so
  `failure_reason` says where it failed; the browser is always closed and captured segments are saved first.
- Process level: `unhandledRejection`/`uncaughtException` → fatal log + graceful shutdown; SIGTERM closes the HTTP
  server, workers (in-flight jobs finish, bounded), Redis, Prisma and the browser, with a force-exit timeout.
- Health: `/api/v1/health` (liveness) and `/api/v1/health/ready` (Redis + database booleans only; 503 when degraded).

## 9. Tests

`npm test` runs the unit tests (Jest): caption aggregation, bot step errors and navigation guard, refresh-token
rotation/reuse (fake store), PKCE, redirect allowlist, URL/colour validators, login lockout, exception-filter
mappings, log redaction, template rendering, Meet-link detection, talk time, transcript parsing (vtt/srt/txt),
transcript chunking, time-zone helpers and settings schemas.
