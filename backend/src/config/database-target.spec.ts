import { isHostedSupabase, remoteDatabaseViolation } from './database-target';

const POOLER =
  'postgresql://postgres.abc:secret-pw@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require';
const DIRECT = 'postgresql://postgres:secret-pw@db.abc.supabase.co:5432/postgres';
const LOCAL = 'postgresql://postgres:postgres@localhost:5433/remi';

describe('isHostedSupabase', () => {
  it.each([POOLER, DIRECT, 'postgres://u:p@DB.ABC.SUPABASE.CO/postgres'])('detects %s', (url) => {
    expect(isHostedSupabase(url)).toBe(true);
  });

  it.each([
    LOCAL,
    'postgresql://postgres@postgres:5432/remi',
    'postgresql://u:p@db.example.com/app',
    'postgresql://u:p@notsupabase.co/app',
    'postgresql://u:p@supabase.co.evil.com/app',
    'not a url',
    '',
    undefined,
  ])('ignores %s', (url) => {
    expect(isHostedSupabase(url)).toBe(false);
  });
});

describe('remoteDatabaseViolation', () => {
  it('allows Supabase in production', () => {
    expect(remoteDatabaseViolation('production', { DATABASE_URL: POOLER, DIRECT_URL: DIRECT }, false)).toBeNull();
  });

  it('allows a local database in development and test', () => {
    expect(remoteDatabaseViolation('development', { DATABASE_URL: LOCAL }, false)).toBeNull();
    expect(remoteDatabaseViolation('test', { DATABASE_URL: LOCAL, DIRECT_URL: undefined }, false)).toBeNull();
  });

  it.each(['development', 'test', undefined])('rejects Supabase when NODE_ENV=%s', (nodeEnv) => {
    const message = remoteDatabaseViolation(nodeEnv, { DATABASE_URL: LOCAL, DIRECT_URL: DIRECT }, false);
    expect(message).toContain('DIRECT_URL → db.abc.supabase.co');
    expect(message).not.toContain('DATABASE_URL →');
  });

  it('never includes credentials in the message', () => {
    const message = remoteDatabaseViolation('development', { DATABASE_URL: POOLER }, false);
    expect(message).not.toBeNull();
    expect(message).not.toContain('secret-pw');
  });

  it('honours the explicit escape hatch', () => {
    expect(remoteDatabaseViolation('development', { DATABASE_URL: POOLER }, true)).toBeNull();
  });
});
