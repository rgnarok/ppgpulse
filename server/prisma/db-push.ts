import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// No-op during a build (no DATABASE_URL) so it can never fail the build phase.
if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL not set — skipping prisma db push (build phase).');
  process.exit(0);
}

execSync('npx prisma db push --skip-generate --accept-data-loss', {
  cwd: path.resolve(here, '..'),
  stdio: 'inherit',
  env: process.env,
});
