/**
 * Exit codes: 0 = database already has content (skip seeding), 2 = empty (run prisma/seed.sql),
 * 1 = could not check (do not seed blindly). Used by the container entrypoint after `migrate deploy`.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

async function main(): Promise<number> {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('seed-check: DATABASE_URL/DIRECT_URL is not set');
    return 1;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
  try {
    const settings = await prisma.appSetting.count();
    console.log(settings > 0 ? 'seed-check: content present, skipping seed' : 'seed-check: empty database');
    return settings > 0 ? 0 : 2;
  } catch (err) {
    console.error(`seed-check failed: ${(err as Error).message}`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main().then((code) => process.exit(code));
