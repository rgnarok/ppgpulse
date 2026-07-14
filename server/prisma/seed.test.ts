import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/db.js';
import { seedTestDb } from '../src/tests/seed-helper.js';

describe('seed', () => {
  beforeAll(async () => {
    await seedTestDb();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('loads the expected record counts', async () => {
    expect(await prisma.role.count()).toBe(4);
    expect(await prisma.user.count()).toBe(13);
    expect(await prisma.consultant.count()).toBe(10);
    expect(await prisma.requirement.count()).toBe(145);
    expect(await prisma.hdis.count()).toBe(138);
  });

  it('makes Kushagra a super_admin', async () => {
    const kb = await prisma.user.findUnique({
      where: { email: 'kushagra@vayuz.com' },
      include: { role: true },
    });
    expect(kb?.name).toBe('Kushagra Bindra');
    expect(kb?.role.key).toBe('super_admin');
  });

  it('is idempotent (re-seeding keeps counts stable)', async () => {
    await seedTestDb();
    expect(await prisma.user.count()).toBe(13);
    expect(await prisma.requirement.count()).toBe(145);
    expect(await prisma.hdis.count()).toBe(138);
  });

  it('hashes passwords with argon2 (never plaintext)', async () => {
    const kb = await prisma.user.findUnique({ where: { email: 'kushagra@vayuz.com' } });
    expect(kb?.passwordHash).toMatch(/^\$argon2/);
    expect(kb?.passwordHash).not.toContain('Passw0rd!');
  });

  it('zeroes every HDIS pipeline on seed', async () => {
    const nonZero = await prisma.hdisPipeline.count({
      where: {
        OR: [
          { r0: { gt: 0 } },
          { r1: { gt: 0 } },
          { r2: { gt: 0 } },
          { r3: { gt: 0 } },
          { r4: { gt: 0 } },
          { r5: { gt: 0 } },
        ],
      },
    });
    expect(nonZero).toBe(0);
  });
});
