# syntax=docker/dockerfile:1.7
# Remi backend — ONE image (`remi-backend:latest`) for every process:
#   docker run remi-backend api | worker | bot | migrate
# Stages: deps (npm ci + prisma generate) → build (nest build) → prod-deps (npm prune) → runtime (final).

ARG NODE_VERSION=24.13.0
# Optional Debian mirror HOST for slow networks, e.g. DEBIAN_MIRROR=http://ftp.de.debian.org — replaces deb.debian.org for
# both /debian and /debian-security (the mirror must serve both). Empty = deb.debian.org (CI).
ARG DEBIAN_MIRROR=

# ---------- deps: full install + Prisma client generation ----------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
ARG DEBIAN_MIRROR
WORKDIR /app
ENV CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1 PUPPETEER_SKIP_DOWNLOAD=1
RUN if [ -n "$DEBIAN_MIRROR" ]; then \
      sed -i "s|^URIs: http://deb.debian.org/|URIs: ${DEBIAN_MIRROR%/}/|" /etc/apt/sources.list.d/debian.sources; fi \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall runs `prisma generate` (no database needed: prisma.config.ts has a placeholder URL fallback)
RUN npm ci --no-audit --no-fund

# ---------- build: compile TypeScript (Nest CLI + Swagger plugin) ----------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---------- prod-deps: production node_modules (includes the Prisma CLI for `migrate`) ----------
# Trims what is never loaded at runtime: non-Postgres Prisma query compilers, TypeScript/@types,
# source maps, type declarations and markdown.
FROM deps AS prod-deps
RUN npm prune --omit=dev --no-audit --no-fund \
  && rm -rf node_modules/typescript node_modules/@types \
  && find node_modules/@prisma/client/runtime node_modules/prisma/build -maxdepth 1 -type f \
       \( -name '*cockroachdb*' -o -name '*mysql*' -o -name '*sqlite*' -o -name '*sqlserver*' \) -delete \
  && find node_modules -type f \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' \
       -o -name '*.md' -o -name '*.markdown' -o -name '*.tsbuildinfo' \) -delete \
  && npm cache clean --force

# ---------- runtime: the single final image ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG DEBIAN_MIRROR
ENV NODE_ENV=production \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    CHROME_PATH=/usr/bin/chromium
WORKDIR /app
# tini (PID 1), openssl/ca-certificates (TLS to Supabase), Debian's Chromium + Xvfb + fonts for the bot.
# npm/yarn/corepack are not needed at runtime (the entrypoint calls node and the local Prisma CLI directly).
RUN if [ -n "$DEBIAN_MIRROR" ]; then \
      sed -i "s|^URIs: http://deb.debian.org/|URIs: ${DEBIAN_MIRROR%/}/|" /etc/apt/sources.list.d/debian.sources; fi \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
     tini openssl ca-certificates \
     chromium xvfb xauth fonts-liberation \
  && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/* /usr/share/doc /usr/share/man \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn* \
     /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --chown=node:node package.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/remi-entrypoint
# Reported by GET /api/v1/health as `version`; CI waits for it to confirm Watchtower rolled out this build.
ARG GIT_SHA=dev
ENV REMI_VERSION=${GIT_SHA}
USER node
EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/remi-entrypoint"]
CMD ["api"]
