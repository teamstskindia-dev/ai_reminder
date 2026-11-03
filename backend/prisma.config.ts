import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ quiet: true });

// The CLI (migrate deploy/dev, db execute, diff) talks to Postgres directly: use DIRECT_URL
// (Supabase session/direct connection, port 5432). The app itself uses DATABASE_URL (pooled,
// port 6543) through @prisma/adapter-pg. `prisma generate` needs no database, so a placeholder
// keeps it working in Docker builds and CI without secrets.
const url =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  'postgresql://placeholder:placeholder@localhost:5432/placeholder';

// Supabase is production-only: refuse migrate/seed/db execute against it from development or test.
// Self-contained on purpose (the runtime image ships this file but not src/); mirrors
// src/config/database-target.ts.
const host = (() => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
})();
if (
  /(^|\.)supabase\.(co|com)$/.test(host) &&
  process.env.NODE_ENV !== 'production' &&
  process.env.ALLOW_REMOTE_DB_IN_DEV !== 'true'
) {
  throw new Error(
    `Refusing to run the Prisma CLI against ${host} with NODE_ENV=${process.env.NODE_ENV ?? 'development'}: ` +
      'Supabase is the production database. Use the local Postgres in development, or set NODE_ENV=production / ' +
      'ALLOW_REMOTE_DB_IN_DEV=true deliberately.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'prisma db execute --file ./prisma/seed.sql',
  },
  datasource: {
    url,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
