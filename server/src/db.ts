import { PrismaClient } from '@prisma/client';
import { getConfig } from './config.js';

/** Singleton Prisma client wired to the validated DATABASE_URL. */
function createPrisma(): PrismaClient {
  const cfg = getConfig();
  return new PrismaClient({
    datasources: { db: { url: cfg.DATABASE_URL } },
    log: cfg.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient = createPrisma();
export type { PrismaClient };
