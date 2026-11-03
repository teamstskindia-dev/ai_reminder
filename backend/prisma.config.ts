import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ quiet: true });

// The CLI (migrate deploy/dev, db execute, diff) talks to Postgres directly: use DIRECT_URL
// (Supabase session/direct connection, port 5432). The app itself uses DATABASE_URL (pooled,
// port 6543) through @prisma/adapter-pg. `prisma generate` needs no database, so a placeholder
// keeps it working in Docker builds and CI without secrets.
const url =
  process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

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
