import type { Prisma, PrismaClient } from '@prisma/client';

export async function listClients(prisma: PrismaClient, q?: string) {
  const where: Prisma.ClientWhereInput = q ? { name: { contains: q, mode: 'insensitive' } } : {};
  return prisma.client.findMany({ where, orderBy: { name: 'asc' } });
}

/** Add `name` to the client master if it isn't already there. Idempotent, case-sensitive
 * on the exact string (so "Religare" and "religare" are distinct entries by design —
 * kept simple rather than guessing which casing is canonical). */
export async function ensureClient(tx: Prisma.TransactionClient | PrismaClient, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await tx.client.upsert({
    where: { name: trimmed },
    update: {},
    create: { name: trimmed },
  });
}
