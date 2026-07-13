import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Reseed the dev database so every e2e run starts from a known state. */
export default function globalSetup() {
  const serverDir = path.resolve(dirname, '../../server');
  execSync('npm run seed', { cwd: serverDir, stdio: 'inherit' });
}
