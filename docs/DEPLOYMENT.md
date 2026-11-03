# Remi — Environments, CI/CD and Deployment

## 1. Environments

| | Development (your machine) | Production |
|---|---|---|
| Database | **Local Postgres + pgvector** (`docker compose up -d postgres` → `localhost:5433`) | **Supabase** (project `ixccbfwnynjcmfsoibsx`, ap-northeast-2) |
| Backend config | `backend/.env` (git-ignored) | `/opt/remi/.env.production` on the VPS (chmod 600) |
| Backend runs | `npm run start:dev` or `docker compose up` | Hostinger VPS `194.238.16.75` (`srv1941414.hstgr.cloud`), Compose project `remi-prod` |
| Public API URL | `http://localhost:4000` | **none yet**: the API is private on the VPS (`127.0.0.1:4000`) until Remi has its own domain |
| Website / admin | `npm run dev` (3000 / 3001) | Vercel (two projects) |

**Supabase is production-only, and this is enforced in code.**

- The API refuses to boot with `NODE_ENV=development` or `test` against `*.supabase.co` / `*.supabase.com`
  (`backend/src/config/database-target.ts`).
- The Prisma CLI does the same (`backend/prisma.config.ts`).
- `ALLOW_REMOTE_DB_IN_DEV=true` is the deliberate escape hatch.

`backend/.env.production` (git-ignored) is the filled copy of the server file; `backend/.env.production.example` is
the committed template. Database credentials never go to GitHub.

## 2. Production topology on the shared VPS

The VPS also runs other projects (`tsk_group` in `/root/tsk_group`, `leogix-prod` in `/opt/leogix-backend`).
**Remi never touches their containers, networks, proxy or files.** It only manages its own Compose project.

```text
/opt/remi  (compose project remi-prod, backend/deploy/docker-compose.prod.yml)
  api        ghcr.io/teamstskindia-dev/remi-backend:production   MIGRATE_ON_START, 127.0.0.1:4000 only
  worker     same image                                          queues
  bot        same image                                          Chromium meeting bot
  redis      redis:7-alpine                                      private network only
  watchtower containrrr/watchtower --scope remi --interval 120 --cleanup --rolling-restart
             (DOCKER_API_VERSION=1.44; registry login from /root/.docker/config.json)
```

- The scoped Watchtower only touches containers labelled `com.centurylinklabs.watchtower.scope=remi`. Redis is not
  labelled, so it is never auto-updated.
- **No public address yet.** Ports 80/443 belong to another project's proxy, and Remi does not share it. From your
  machine, reach the API through an SSH tunnel:
  `ssh -N -L 4000:127.0.0.1:4000 root@194.238.16.75`, then use `http://localhost:4000`.
- **When Remi gets a domain**, choose one of these. Neither touches the other projects.
  - A Remi-only Caddy on a free port with a DNS-01 certificate (e.g. `https://api.<domain>:8444`).
  - A dedicated VPS where Remi owns 80/443.

  Then set `API_PUBLIC_URL`, `GOOGLE_REDIRECT_URI` and `COOKIE_DOMAIN` in `/opt/remi/.env.production` (they currently
  hold placeholders), and the GitHub variable `API_PUBLIC_URL`.

## 3. Release pipeline (`.github/workflows/ci-cd.yml`)

```text
PR / push ──► changes ──► verify-backend │ verify-web │ verify-admin │ verify-mobile   (only what changed)
                          backend-image-check (PRs: the Docker image builds)

merge to main ─► backend changed ─► backend-image: push remi-backend:<sha> + :production
                                     └► Watchtower (≤ 2 min) pulls :production, restarts api → worker → bot;
                                        the api applies pending Prisma migrations on start
                                     └► deploy-backend: once API_PUBLIC_URL is set, waits until its /api/v1/health
                                        reports version == <sha> (skipped with a warning while the API is private)
               ─► web changed   ─► deploy-web   (Vercel CLI)    ┐ wait for the backend rollout;
               ─► admin changed ─► deploy-admin (Vercel CLI)    ┘ held back if any backend stage failed
```

| Changed folder | Verified on every PR/push | Released on merge to `main` |
|---|---|---|
| `backend/**` | typecheck, lint, unit tests, build, migrations + seed on fresh pgvector, Docker build | VPS via Watchtower |
| `web/**` | typecheck, lint, production build | Vercel (website) |
| `admin/**` | typecheck, lint, production build | Vercel (admin) |
| `mobile/**` | typecheck, lint | never (EAS builds are manual) |
| `.github/workflows/**` | all apps | nothing |

- **Manual release:** Actions → CI/CD → Run workflow on `main` with `deploy` = `all` | `backend` | `web` | `admin`.
- **No server secrets in GitHub:** the backend deploy needs none, because the server pulls the image. The image is
  private: Watchtower uses the server's existing `ghcr.io` login, the same one `leogix-prod` uses. That account needs
  read access to the `remi-backend` package. It has it automatically when it can read the `ai_reminder` repository,
  because CI links the package to the repo through the `org.opencontainers.image.source` label.
- **Rollback:** push or re-run an older commit, or on the server pin a previous build. Each release is also tagged
  `:<sha>`:
  ```bash
  cd /opt/remi && REMI_IMAGE=ghcr.io/teamstskindia-dev/remi-backend:<sha> docker compose up -d api worker bot
  ```
  While pinned, Watchtower follows `:<sha>`. Run `docker compose up -d` without `REMI_IMAGE` to return to `:production`.
- **Schema changes:** migrations are forward-only and Watchtower restarts containers one at a time, so for a few
  seconds old and new code can run together. Keep releases backward compatible (expand → migrate → contract).

## 4. GitHub and Vercel settings

**Repository variable** (Settings → Secrets and variables → Actions → Variables): `API_PUBLIC_URL`, the public API
origin, which the rollout check uses. Leave it unset while the API is private.

**Vercel** (website and admin):

1. Create two projects (e.g. `remi-web`, `remi-admin`) and leave Root Directory empty. CI runs the CLI inside `web/`
   and `admin/`. `vercel.json` in each app turns off Vercel's own Git deployments, so only this pipeline deploys.
2. Production env vars:
   - **Website:** `NEXT_PUBLIC_API_URL`, `API_URL_INTERNAL` (= the API URL), `NEXT_PUBLIC_SITE_URL`, and
     `REVALIDATE_SECRET` set to the same value as `WEB_REVALIDATE_SECRET` in `.env.production`.
   - **Admin:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL`.
3. Secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_WEB`, `VERCEL_PROJECT_ID_ADMIN`.
4. Variables: `WEB_DEPLOY_ENABLED=true`, `ADMIN_DEPLOY_ENABLED=true`.
5. Domains: put the website on `<domain>`, the admin on `admin.<domain>` and the API on `api.<domain>` (all under one
   parent), and set `COOKIE_DOMAIN=.<domain>` in `.env.production`. Browser sign-in needs the shared parent domain:
   `*.vercel.app` + `*.hstgr.cloud` cannot share cookies.

## 5. Operations (on the VPS)

```bash
cd /opt/remi
docker compose ps                                  # remi-prod containers + health
docker compose logs -f --tail 100 api worker bot   # structured JSON logs (secrets redacted)
docker compose logs --tail 50 watchtower           # update checks / pulls
curl -s http://127.0.0.1:4000/api/v1/health        # {"status":"ok","version":"<sha>"}
```

- **Change a secret:** edit `/opt/remi/.env.production`, then `docker compose up -d` (recreates api/worker/bot).
  Add new variables **before** merging code that needs them.
- **Change the stack definition:** copy `backend/deploy/docker-compose.prod.yml` to `/opt/remi/docker-compose.yml`, then
  run `docker compose up -d`. Watchtower updates images, not the compose file.
- **First-time bootstrap** (already done on 194.238.16.75). Build or pull the image, then:
  ```bash
  install -d -m 0700 /opt/remi
  # copy backend/deploy/docker-compose.prod.yml → /opt/remi/docker-compose.yml
  # copy backend/.env.production → /opt/remi/.env.production, then chmod 600
  cd /opt/remi && docker compose up -d   # the api migrates Supabase and seeds an empty database on first start
  ```
