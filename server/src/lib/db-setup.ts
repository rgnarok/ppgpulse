import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../db.js';
import { seedDatabase, type SeedData } from './seed-core.js';

const here = path.dirname(fileURLToPath(import.meta.url)); // .../server/dist/lib

export interface SetupLogger {
  info: (msg: string) => void;
  error: (msg: string, err?: unknown) => void;
}

/**
 * Ensure the schema exists (prisma db push) and demo data is seeded — in-process,
 * so it works in the compiled runtime image (no src/ or tsx needed at runtime).
 * Runs in production / on Render / when RUN_DB_SETUP=true. Idempotent; failures
 * are logged but never crash the server.
 */
export async function ensureDatabase(log: SetupLogger): Promise<void> {
  if (process.env.RUN_DB_SETUP === 'false') return;
  const enabled =
    process.env.RUN_DB_SETUP === 'true' ||
    process.env.NODE_ENV === 'production' ||
    !!process.env.RENDER;
  if (!enabled) return;
  if (!process.env.DATABASE_URL) {
    log.error('DB setup requested but DATABASE_URL is not set — skipping.');
    return;
  }

  const serverDir = path.resolve(here, '../..'); // dist/lib -> dist -> server
  try {
    log.info('Ensuring database schema (prisma db push)…');
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: serverDir,
      stdio: 'inherit',
      env: process.env,
    });
  } catch (err) {
    log.error('prisma db push failed', err);
    return;
  }

  try {
    log.info('Seeding database (idempotent)…');
    const seed = JSON.parse(
      readFileSync(path.join(serverDir, 'prisma', 'seed.json'), 'utf-8'),
    ) as SeedData;
    const counts = await seedDatabase(prisma, seed);
    log.info(`Database ready: ${JSON.stringify(counts)}`);
  } catch (err) {
    log.error('Seeding failed', err);
  }
}
