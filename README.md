# Remi — AI meeting assistant

Remi connects to Google Calendar, sends a notetaker bot into Google Meet calls, turns each conversation into a
report (summary, chapters, action items, key questions, scores), remembers commitments, and reminds you before
things are due. Everything users see — branding, theme, landing page, navigation, plans, onboarding, feature flags,
AI prompts, bot behaviour — is managed from the admin panel.

| Folder     | Product                         | Stack                                        | Local URL                    |
|------------|---------------------------------|----------------------------------------------|------------------------------|
| `backend/` | API, queue worker, meeting bot  | NestJS, Prisma, Supabase Postgres, Redis, BullMQ, Gemini, Docker | http://localhost:4000 (Swagger: `/docs`) |
| `web/`     | Website + signed-in web app     | Next.js                                      | http://localhost:3000        |
| `admin/`   | Admin panel                     | Next.js                                      | http://localhost:3001        |
| `mobile/`  | iOS + Android app (one codebase)| React Native (Expo)                          | Expo dev server              |

Design docs: [docs/HLD.md](docs/HLD.md) (architecture, flows, security, deployment) and
[docs/API_CONTRACT.md](docs/API_CONTRACT.md) (every endpoint and JSON shape shared by the four products).

## Quick start

1. **Backend** — see [backend/README.md](backend/README.md) for Google OAuth, Gemini and Cloudinary setup.
   Development always uses a **local** Postgres; Supabase is production-only, and the API refuses it in dev.
   ```bash
   cp backend/.env.example backend/.env        # local DB URLs are the defaults; add Google + Gemini keys
   docker compose up -d --build                # postgres, redis, migrate, api, worker, bot — one image: remi-backend
   # or run only the databases and start the backend on the host:
   docker compose up -d postgres redis && cd backend && npm run prisma:migrate && npm run db:seed && npm run start:dev
   ```
   On first boot the API creates the super admin from `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` in `backend/.env`.
   For a fully offline demo set `AI_MOCK=true` and `BOT_MODE=simulate`.

2. **Website** — [web/README.md](web/README.md)
   ```bash
   cd web && cp .env.example .env.local && npm install && npm run dev      # REVALIDATE_SECRET = backend WEB_REVALIDATE_SECRET
   ```

3. **Admin panel** — [admin/README.md](admin/README.md)
   ```bash
   cd admin && cp .env.example .env.local && npm install && npm run dev    # sign in with the seeded super admin
   ```

4. **Mobile (iOS + Android)** — [mobile/README.md](mobile/README.md)
   ```bash
   cd mobile && cp .env.example .env && npm install && npx expo start      # i = iOS simulator, a = Android emulator
   ```

## Production and CI/CD

Merging to `main` deploys only what changed:

- `backend/` → Hostinger VPS: CI pushes `remi-backend:production` to GHCR, Watchtower on the server pulls it, and the
  API migrates Supabase on start (running privately on the VPS until Remi has a public domain);
- `web/` → Vercel;
- `admin/` → Vercel.

Pull requests run typecheck, lint, tests and builds for the changed apps. Setup, secrets and operations are in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## What needs real credentials

| Feature                         | Needs                                                                 |
|---------------------------------|-----------------------------------------------------------------------|
| User sign-in (web + mobile)     | Google OAuth client (`GOOGLE_CLIENT_ID/SECRET`), redirect URI `http://localhost:4000/api/v1/auth/google/callback`, scopes `openid email profile calendar.events.readonly` |
| AI reports, Ask AI              | `GEMINI_API_KEY` (or `AI_MOCK=true` for deterministic fake output)    |
| Real Google Meet bot            | `BOT_MODE=puppeteer` + Chromium (bundled in the Docker image)         |
| Recording uploads               | Supabase project (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)        |
| Admin media uploads             | Real Cloudinary keys (dev uses the public `demo` cloud; pasting URLs always works) |
| Push notifications              | EAS project + APNs (iOS) / FCM v1 (Android) credentials, development build |
| Email                           | SMTP settings + `notifications.emailEnabled` in the admin panel       |
