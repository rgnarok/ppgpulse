import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../db.js';
import { seedDatabase, type SeedData } from '../../prisma/seed-core.js';
import { resetDb } from './helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const seedData = JSON.parse(
  readFileSync(path.resolve(here, '../../prisma/seed.json'), 'utf-8'),
) as SeedData;

/** Reset the test DB then load the full demo dataset. */
export async function seedTestDb() {
  await resetDb();
  return seedDatabase(prisma, seedData);
}
