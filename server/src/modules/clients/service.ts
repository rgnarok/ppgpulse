import type { Prisma, PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../lib/errors.js';

export async function listClients(prisma: PrismaClient, q?: string) {
  const where: Prisma.ClientWhereInput = q ? { name: { contains: q, mode: 'insensitive' } } : {};
  return prisma.client.findMany({ where, orderBy: { name: 'asc' } });
}

/** Explicit create from the Client master admin screen (distinct from the
 * idempotent `ensureClient` upsert triggered by saving an HDIS record). */
export async function createClient(prisma: PrismaClient, name: string) {
  const trimmed = name.trim();
  const existing = await prisma.client.findUnique({ where: { name: trimmed } });
  if (existing)
    throw new ConflictError('A client with this name already exists', 'duplicate_client');
  return prisma.client.create({ data: { name: trimmed } });
}

export async function updateClient(prisma: PrismaClient, id: string, name: string) {
  const trimmed = name.trim();
  const current = await prisma.client.findUnique({ where: { id } });
  if (!current) throw new NotFoundError('Client not found', 'client_not_found');
  if (trimmed !== current.name) {
    const clash = await prisma.client.findUnique({ where: { name: trimmed } });
    if (clash)
      throw new ConflictError('A client with this name already exists', 'duplicate_client');
  }
  return prisma.client.update({ where: { id }, data: { name: trimmed } });
}

export async function deleteClient(prisma: PrismaClient, id: string) {
  const current = await prisma.client.findUnique({ where: { id } });
  if (!current) throw new NotFoundError('Client not found', 'client_not_found');
  await prisma.client.delete({ where: { id } });
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
