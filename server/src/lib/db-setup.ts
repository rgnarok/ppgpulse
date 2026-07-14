import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)); // .../server/dist/lib

export interface SetupLogger {
  info: (msg: string) => void;
  error: (msg: string, err?: unknown) => void;
}

/**
 * Ensure the database schema exists and demo data is seeded, at server boot.
 * Runs in production (or when RUN_DB_SETUP=true) so the app is self-contained
 * regardless of the host's build/start command. Idempotent; failures are logged
 * but do not crash the server.
 */
export function ensureDatabase(log: SetupLogger): void {
  if (process.env.RUN_DB_SETUP === 'false') return;
  const enabled =
    process.env.RUN_DB_SETUP === 'true' ||
    process.env.NODE_ENV === 'production' ||
    !!process.env.RENDER; // Render always sets RENDER=true
  if (!enabled) return;
  if (!process.env.DATABASE_URL) {
    log.error('RUN_DB_SETUP requested but DATABASE_URL is not set — skipping.');
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
    log.info('Seeding database (idempotent)…');
    execSync('npx tsx prisma/seed.ts', { cwd: serverDir, stdio: 'inherit', env: process.env });
    log.info('Database ready.');
  } catch (err) {
    log.error('Database setup failed', err);
  }
}
