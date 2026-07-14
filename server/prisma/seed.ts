import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // During a build (no DATABASE_URL) this is a no-op so it can't fail the build.
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not set — skipping seed (build phase).');
    return;
  }
  const { prisma } = await import('../src/db.js');
  const { seedDatabase } = await import('../src/lib/seed-core.js');
  const seed = JSON.parse(readFileSync(path.resolve(here, 'seed.json'), 'utf-8'));
  try {
    const counts = await seedDatabase(prisma, seed);
    console.log('Seed complete:', counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
