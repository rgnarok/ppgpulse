import type { PrismaClient } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { CreateLogInput, UpdateLogInput } from './schema.js';

/** GET /consultant-log?month= — per-day entry counts for the caller's own log. */
export async function monthCounts(prisma: PrismaClient, consultantId: string, month: string) {
  const rows = await prisma.consultantLog.findMany({
    where: { consultantId, date: { gte: `${month}-01`, lte: `${month}-31` } },
    select: { date: true },
  });
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.date] = (counts[r.date] ?? 0) + 1;
  return { month, counts, total: rows.length };
}

/** GET /consultant-log/day/:date — the caller's own entries for that date. */
export async function dayEntries(prisma: PrismaClient, consultantId: string, date: string) {
  return prisma.consultantLog.findMany({
    where: { consultantId, date },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createLog(
  prisma: PrismaClient,
  consultantId: string,
  createdBy: string,
  input: CreateLogInput,
) {
  return prisma.consultantLog.create({
    data: {
      consultantId,
      date: input.date,
      eventsHosted: input.eventsHosted,
      eventsParticipated: input.eventsParticipated,
      insights: input.insights,
      remarks: input.remarks ?? null,
      createdBy,
    },
  });
}

async function ownEntryOrThrow(prisma: PrismaClient, id: string, consultantId: string) {
  const existing = await prisma.consultantLog.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Log entry not found', 'log_not_found');
  if (existing.consultantId !== consultantId) {
    throw new ForbiddenError('You can only edit your own activity log', 'not_owner');
  }
  return existing;
}

export async function updateLog(
  prisma: PrismaClient,
  id: string,
  consultantId: string,
  input: UpdateLogInput,
) {
  await ownEntryOrThrow(prisma, id, consultantId);
  return prisma.consultantLog.update({
    where: { id },
    data: {
      date: input.date ?? undefined,
      eventsHosted: input.eventsHosted ?? undefined,
      eventsParticipated: input.eventsParticipated ?? undefined,
      insights: input.insights ?? undefined,
      remarks: input.remarks === undefined ? undefined : input.remarks,
    },
  });
}

export async function deleteLog(prisma: PrismaClient, id: string, consultantId: string) {
  await ownEntryOrThrow(prisma, id, consultantId);
  await prisma.consultantLog.delete({ where: { id } });
}
