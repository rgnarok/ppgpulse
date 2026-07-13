import { prisma } from '../db.js';

/** Truncate every application table (test DB only). Fast reset between suites. */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "HdisActivity","HdisAttachment","HdisPipeline","HdisOwner",
      "Interview","Requirement","Consultant","UserOverride",
      "User","RolePermission","Role","Hdis"
    RESTART IDENTITY CASCADE;
  `);
}
