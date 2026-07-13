import type { Prisma, PrismaClient, InterviewSession } from '@prisma/client';
import { NotFoundError } from '../../lib/errors.js';
import { loadDirectory, scopeNames, type CurrentUser } from '../rbac/index.js';
import type { CreateInterviewInput, UpdateInterviewInput } from './schema.js';

/** Consultant ids the caller may see (team scope) or all (org scope). */
async function scopedConsultantIds(prisma: PrismaClient, user: CurrentUser): Promise<string[]> {
  const directory = await loadDirectory(prisma);
  const names = scopeNames(user, directory);
  const consultants = await prisma.consultant.findMany({ include: { user: true } });
  return consultants.filter((c) => names.has(c.user.name)).map((c) => c.id);
}

/** Build a visibility filter: org sees everything; team sees in-scope or own rows. */
async function visibilityWhere(
  prisma: PrismaClient,
  user: CurrentUser,
): Promise<Prisma.InterviewWhereInput> {
  if (user.role.scope === 'org') return {};
  const ids = await scopedConsultantIds(prisma, user);
  return {
    OR: [{ ppgConsultantId: { in: ids } }, { createdBy: user.id }],
  };
}

type InterviewRow = Prisma.InterviewGetPayload<{
  include: { creator: { select: { name: true } } };
}>;

function toDto(i: InterviewRow, consultantName?: string | null) {
  return {
    id: i.id,
    date: i.date,
    session: i.session,
    time: i.time,
    candidate: i.candidate,
    requirementRef: i.requirementRef,
    ppgConsultantId: i.ppgConsultantId,
    ppgConsultantName: consultantName ?? null,
    stage: i.stage,
    status: i.status,
    notes: i.notes,
    createdBy: i.createdBy,
    createdByName: i.creator.name,
  };
}

/** GET /interviews?month → per-day counts within the caller's visibility. */
export async function monthCounts(prisma: PrismaClient, user: CurrentUser, month: string) {
  const base = await visibilityWhere(prisma, user);
  const rows = await prisma.interview.findMany({
    where: { AND: [base, { date: { gte: `${month}-01`, lte: `${month}-31` } }] },
    select: { date: true },
  });
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.date] = (counts[r.date] ?? 0) + 1;
  return { month, counts, total: rows.length };
}

/** GET /interviews/day/:date → {mid, end, byConsultant}. */
export async function dayView(prisma: PrismaClient, user: CurrentUser, date: string) {
  const base = await visibilityWhere(prisma, user);
  const rows = await prisma.interview.findMany({
    where: { AND: [base, { date }] },
    include: { creator: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const consultants = await prisma.consultant.findMany({ include: { user: true } });
  const nameById = new Map(consultants.map((c) => [c.id, c.user.name]));

  const mid = rows
    .filter((r) => r.session === 'mid')
    .map((r) => toDto(r, nameById.get(r.ppgConsultantId ?? '')));
  const end = rows
    .filter((r) => r.session === 'end')
    .map((r) => toDto(r, nameById.get(r.ppgConsultantId ?? '')));

  const byConsultant = new Map<string, number>();
  for (const r of rows) {
    const name = r.ppgConsultantId ? (nameById.get(r.ppgConsultantId) ?? 'Unknown') : 'Unassigned';
    byConsultant.set(name, (byConsultant.get(name) ?? 0) + 1);
  }
  return {
    date,
    mid,
    end,
    byConsultant: [...byConsultant.entries()].map(([name, count]) => ({ name, count })),
  };
}

export async function createInterview(
  prisma: PrismaClient,
  user: CurrentUser,
  input: CreateInterviewInput,
) {
  const created = await prisma.interview.create({
    data: {
      date: input.date,
      session: input.session as InterviewSession,
      time: input.time ?? null,
      candidate: input.candidate,
      requirementRef: input.requirementRef ?? null,
      ppgConsultantId: input.ppgConsultantId ?? null,
      stage: input.stage ?? null,
      status: input.status ?? null,
      notes: input.notes ?? null,
      createdBy: user.id,
    },
    include: { creator: { select: { name: true } } },
  });
  return toDto(created);
}

export async function updateInterview(
  prisma: PrismaClient,
  id: string,
  input: UpdateInterviewInput,
) {
  const existing = await prisma.interview.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Interview not found');
  const updated = await prisma.interview.update({
    where: { id },
    data: {
      date: input.date ?? undefined,
      session: (input.session as InterviewSession | undefined) ?? undefined,
      time: input.time === undefined ? undefined : input.time,
      candidate: input.candidate ?? undefined,
      requirementRef: input.requirementRef === undefined ? undefined : input.requirementRef,
      ppgConsultantId: input.ppgConsultantId === undefined ? undefined : input.ppgConsultantId,
      stage: input.stage === undefined ? undefined : input.stage,
      status: input.status === undefined ? undefined : input.status,
      notes: input.notes === undefined ? undefined : input.notes,
    },
    include: { creator: { select: { name: true } } },
  });
  return toDto(updated);
}

export async function deleteInterview(prisma: PrismaClient, id: string) {
  const existing = await prisma.interview.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Interview not found');
  await prisma.interview.delete({ where: { id } });
}
