/**
 * Environment ↔ database pairing. Supabase hosts the production database only; development and test
 * always run against a local Postgres. Pointing a dev/test process at Supabase is refused at boot
 * (and by prisma.config.ts for the CLI) so a local `prisma migrate dev` or seed can never touch
 * production data. ALLOW_REMOTE_DB_IN_DEV=true is the explicit, deliberate escape hatch.
 */

const HOSTED_SUPABASE = /(^|\.)supabase\.(co|com)$/i;

/** Host of a postgres:// connection string, or null when it cannot be parsed. */
export function databaseHost(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** True for Supabase's direct hosts (db.<ref>.supabase.co) and poolers (*.pooler.supabase.com). */
export function isHostedSupabase(connectionString: string | undefined): boolean {
  if (!connectionString) return false;
  const host = databaseHost(connectionString);
  return host !== null && HOSTED_SUPABASE.test(host);
}

/**
 * Returns an error message when a non-production process is configured against Supabase,
 * otherwise null. Only hosts are reported — never credentials.
 */
export function remoteDatabaseViolation(
  nodeEnv: string | undefined,
  urls: Record<string, string | undefined>,
  allowRemoteInDev: boolean,
): string | null {
  if (nodeEnv === 'production' || allowRemoteInDev) return null;
  const offending = Object.entries(urls).filter(([, url]) => isHostedSupabase(url));
  if (offending.length === 0) return null;
  const list = offending.map(([key, url]) => `${key} → ${databaseHost(url as string)}`).join(', ');
  return (
    `NODE_ENV=${nodeEnv ?? 'development'} must use a local database, but ${list} is a Supabase (production) host. ` +
    'Point DATABASE_URL/DIRECT_URL at local Postgres (see backend/.env.example), or set ALLOW_REMOTE_DB_IN_DEV=true deliberately.'
  );
}
