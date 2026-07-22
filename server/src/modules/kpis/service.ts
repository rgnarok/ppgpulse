import type { PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { loadDirectory, scopeNames, type CurrentUser } from '../rbac/index.js';
import { buildCalendar, datesInMonth } from './calendar.js';
import type { CreateKpiInput, UpdateKpiInput } from './schema.js';

export async function listKpis(prisma: PrismaClient) {
  return prisma.kpi.findMany({ orderBy: { kpiNo: 'asc' } });
}

export async function createKpi(prisma: PrismaClient, input: CreateKpiInput) {
  const clash = await prisma.kpi.findUnique({ where: { kpiNo: input.kpiNo } });
  if (clash) throw new ConflictError('A KPI with this KPI No. already exists', 'duplicate_kpi');
  return prisma.kpi.create({ data: input });
}

export async function updateKpi(prisma: PrismaClient, id: string, input: UpdateKpiInput) {
  const current = await prisma.kpi.findUnique({ where: { id } });
  if (!current) throw new NotFoundError('KPI not found', 'kpi_not_found');
  if (input.kpiNo !== current.kpiNo) {
    const clash = await prisma.kpi.findUnique({ where: { kpiNo: input.kpiNo } });
    if (clash) throw new ConflictError('A KPI with this KPI No. already exists', 'duplicate_kpi');
  }
  return prisma.kpi.update({ where: { id }, data: input });
}

export async function deleteKpi(prisma: PrismaClient, id: string) {
  const current = await prisma.kpi.findUnique({ where: { id } });
  if (!current) throw new NotFoundError('KPI not found', 'kpi_not_found');
  await prisma.kpi.delete({ where: { id } });
}

async function getKpiOrThrow(prisma: PrismaClient, id: string) {
  const kpi = await prisma.kpi.findUnique({ where: { id } });
  if (!kpi) throw new NotFoundError('KPI not found', 'kpi_not_found');
  return kpi;
}

/** Consultants visible to `user` per their role scope — org sees all, team/own are narrowed. */
async function scopedConsultants(prisma: PrismaClient, user: CurrentUser) {
  const directory = await loadDirectory(prisma);
  const names = scopeNames(user, directory);
  const consultants = await prisma.consultant.findMany({
    include: { user: { select: { name: true, team: true, isActive: true } } },
    orderBy: { user: { name: 'asc' } },
  });
  if (user.role.scope === 'org') return consultants;
  return consultants.filter((c) => names.has(c.user.name));
}

/**
 * GET /kpis/:id/targets — every consultant in scope, with their effective daily target
 * for this KPI (an override if one's been set, otherwise the KPI's default numericTarget).
 */
export async function listKpiTargets(prisma: PrismaClient, user: CurrentUser, kpiId: string) {
  const kpi = await getKpiOrThrow(prisma, kpiId);
  const consultants = await scopedConsultants(prisma, user);
  const overrides = await prisma.kpiConsultantTarget.findMany({ where: { kpiId } });
  const overrideByConsultant = new Map(overrides.map((o) => [o.consultantId, o.target]));
  const defaultTarget = kpi.numericTarget ?? 0;
  return consultants.map((c) => ({
    consultantId: c.id,
    name: c.user.name,
    team: c.user.team,
    isActive: c.user.isActive,
    target: overrideByConsultant.get(c.id) ?? defaultTarget,
    isOverride: overrideByConsultant.has(c.id),
  }));
}

/** PUT /kpis/:id/targets/:consultantId — set (or clear, via target=default) an override. */
export async function setKpiTarget(
  prisma: PrismaClient,
  kpiId: string,
  consultantId: string,
  target: number,
) {
  await getKpiOrThrow(prisma, kpiId);
  const consultant = await prisma.consultant.findUnique({ where: { id: consultantId } });
  if (!consultant) throw new NotFoundError('Consultant not found', 'consultant_not_found');
  return prisma.kpiConsultantTarget.upsert({
    where: { kpiId_consultantId: { kpiId, consultantId } },
    update: { target },
    create: { kpiId, consultantId, target },
  });
}

/** PATCH /kpis/:id/default-target — set the KPI-wide default daily target. */
export async function setDefaultTarget(prisma: PrismaClient, kpiId: string, target: number) {
  await getKpiOrThrow(prisma, kpiId);
  return prisma.kpi.update({ where: { id: kpiId }, data: { numericTarget: target } });
}

/** DELETE /kpis/:id/targets/:consultantId — revert a consultant to the KPI's default target. */
export async function clearKpiTarget(prisma: PrismaClient, kpiId: string, consultantId: string) {
  await prisma.kpiConsultantTarget
    .delete({ where: { kpiId_consultantId: { kpiId, consultantId } } })
    .catch(() => null); // already at default — deleting a non-existent override is a no-op
}

/**
 * GET /kpis/:id/calendar?month= — for a KPI wired to 'interviews_per_day': each day's
 * actual interview count vs. the sum of every in-scope consultant's target, colored
 * green/amber/red, or left uncolored on days with no interview data logged at all.
 */
export async function interviewsCalendar(
  prisma: PrismaClient,
  user: CurrentUser,
  kpiId: string,
  month: string,
  team?: string,
) {
  const kpi = await getKpiOrThrow(prisma, kpiId);
  if (kpi.trackedMetric !== 'interviews_per_day') {
    throw new NotFoundError('This KPI is not wired to a tracked metric', 'not_tracked');
  }

  const consultants = await scopedConsultants(prisma, user);
  const inScope = team ? consultants.filter((c) => c.user.team === team) : consultants;
  const consultantIds = inScope.map((c) => c.id);

  const overrides = await prisma.kpiConsultantTarget.findMany({
    where: { kpiId, consultantId: { in: consultantIds } },
  });
  const overrideByConsultant = new Map(overrides.map((o) => [o.consultantId, o.target]));
  const defaultTarget = kpi.numericTarget ?? 0;
  const totalTarget = inScope.reduce(
    (sum, c) => sum + (overrideByConsultant.get(c.id) ?? defaultTarget),
    0,
  );

  const rows = await prisma.interview.findMany({
    where: {
      date: { gte: `${month}-01`, lte: `${month}-31` },
      ppgConsultantId: { in: consultantIds },
    },
    select: { date: true },
  });
  const actualByDate: Record<string, number> = {};
  for (const r of rows) actualByDate[r.date] = (actualByDate[r.date] ?? 0) + 1;

  const dates = datesInMonth(month);
  const days = buildCalendar(dates, actualByDate, totalTarget);
  return { month, totalTarget, consultantCount: inScope.length, days };
}
