import type { Prisma, PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../lib/errors.js';

export async function listClients(prisma: PrismaClient, q?: string) {
  const where: Prisma.ClientWhereInput = q ? { name: { contains: q, mode: 'insensitive' } } : {};
  return prisma.client.findMany({ where, orderBy: { name: 'asc' } });
}

/** Case-insensitive lookup helper -- "Apexon" and "apexon" are the same client. */
async function findByNameInsensitive(
  client: Prisma.TransactionClient | PrismaClient,
  name: string,
) {
  return client.client.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
}

/** Explicit create from the Client master admin screen (distinct from the
 * idempotent `ensureClient` upsert triggered by saving an HDIS record). */
export async function createClient(prisma: PrismaClient, name: string) {
  const trimmed = name.trim();
  const existing = await findByNameInsensitive(prisma, trimmed);
  if (existing)
    throw new ConflictError(`A client named "${existing.name}" already exists`, 'duplicate_client');
  return prisma.client.create({ data: { name: trimmed } });
}

export async function updateClient(prisma: PrismaClient, id: string, name: string) {
  const trimmed = name.trim();
  const current = await prisma.client.findUnique({ where: { id } });
  if (!current) throw new NotFoundError('Client not found', 'client_not_found');
  if (trimmed.toLowerCase() !== current.name.toLowerCase()) {
    const clash = await findByNameInsensitive(prisma, trimmed);
    if (clash)
      throw new ConflictError(`A client named "${clash.name}" already exists`, 'duplicate_client');
  }
  return prisma.client.update({ where: { id }, data: { name: trimmed } });
}

export async function deleteClient(prisma: PrismaClient, id: string) {
  const current = await prisma.client.findUnique({ where: { id } });
  if (!current) throw new NotFoundError('Client not found', 'client_not_found');
  await prisma.client.delete({ where: { id } });
}

/** Add `name` to the client master if it isn't already there. Idempotent and
 * case-insensitive: if "Apexon" already exists and an HDIS record is saved with
 * "apexon", we reuse the existing row rather than creating a case-variant duplicate. */
export async function ensureClient(tx: Prisma.TransactionClient | PrismaClient, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const existing = await findByNameInsensitive(tx, trimmed);
  if (existing) return;
  await tx.client.create({ data: { name: trimmed } }).catch(async (err) => {
    // Race: another request created a matching client between our check and this
    // insert. Treat as success rather than surfacing a 500 for a benign race.
    const clash = await findByNameInsensitive(tx, trimmed);
    if (!clash) throw err;
  });
}
