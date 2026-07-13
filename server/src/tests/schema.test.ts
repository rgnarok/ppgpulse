import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../db.js';

/**
 * Migration/schema test: prepare-test-db.ts applies the full schema to the
 * TEST_DATABASE_URL via `prisma db push`. Here we assert every model's table
 * exists and is queryable (fresh DB → count 0).
 */
describe('schema', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('applies all tables and they are queryable', async () => {
    const counts = await Promise.all([
      prisma.role.count(),
      prisma.rolePermission.count(),
      prisma.user.count(),
      prisma.userOverride.count(),
      prisma.consultant.count(),
      prisma.requirement.count(),
      prisma.hdis.count(),
      prisma.hdisOwner.count(),
      prisma.hdisPipeline.count(),
      prisma.hdisAttachment.count(),
      prisma.hdisActivity.count(),
      prisma.interview.count(),
    ]);
    // All counts are numbers (tables exist); on a fresh test DB they are >= 0.
    for (const c of counts) {
      expect(typeof c).toBe('number');
      expect(c).toBeGreaterThanOrEqual(0);
    }
  });

  it('connects to the test database', async () => {
    const [{ current_database }] = await prisma.$queryRawUnsafe<{ current_database: string }[]>(
      'SELECT current_database()',
    );
    expect(current_database).toContain('test');
  });
});
