import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/db.js';
import { seedDatabase, type SeedData } from './seed-core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(path.resolve(here, 'seed.json'), 'utf-8')) as SeedData;

async function main() {
  const counts = await seedDatabase(prisma, seed);
  console.log('Seed complete:', counts);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
