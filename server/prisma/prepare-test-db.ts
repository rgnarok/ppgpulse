/**
 * Prepare the test database: point Prisma at TEST_DATABASE_URL and push the
 * schema (fast, migration-free) so integration tests run against a real DB.
 * Invoked by `npm run test` before vitest.
 */
import { execSync } from 'node:child_process';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../.env') });
loadDotenv({ path: path.resolve(here, '../../.env') });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('TEST_DATABASE_URL is not set — cannot prepare the test database.');
  process.exit(1);
}

try {
  execSync('prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(here, '..'),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });
} catch (err) {
  console.error('Failed to prepare test database:', err);
  process.exit(1);
}
