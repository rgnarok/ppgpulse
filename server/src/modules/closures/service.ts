import type { Prisma, PrismaClient } from '@prisma/client';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { CLOSURE_TYPES, type ClosureInput, type ClosureType, type TargetsInput } from './schema.js';
import { parseImport } from './parse.js';

export const DEFAULT_TEAM_TARGET = 20;
export const BENCHMARK = 0.8;
const UNASSIGNED = 'unassigned';

/** The 12 YYYY-MM months (Apr -> Mar) of fiscal year `fy` (starting-year string). */
export function fyMonths(fy: string): string[] {
  const y = Number(fy);
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((3 + i) % 12) + 1;
    return `${m >= 4 ? y : y + 1}-${String(m).padStart(2, '0')}`;
  });
}

export function currentFyOf(now = new Date()): string {
  const y = now.getFullYear();
  return String(now.getMonth() + 1 >= 4 ? y : y - 1);
}

function curMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

type PerType = Record<ClosureType, number>;
const emptyPerType = (): PerType => ({ RADC: 0, RADF: 0, Internal: 0 });

export interface ClosureEntry {
  id: string;
  month: string;
  userId: string | null;
  recruiterName: string;
  type: ClosureType;
  count: number;
  client: string | null;
  candidate: string | null;
  createdAt: string;
}

export async function closuresScorecard(prisma: PrismaClient, fy?: string, now = new Date()) {
  const fyKey = fy ?? currentFyOf(now);
  const months = fyMonths(fyKey);
  const nowMonth = curMonth(now);

  const [rows, targets, users, hdis] = await Promise.all([
    prisma.closure.findMany({
      where: { month: { in: months } },
      orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.closureTarget.findMany(),
    prisma.user.findMany({
      select: { id: true, name: true, isActive: true, consultant: { select: { id: true } } },
    }),
    prisma.hdis.findMany({
      where: { reqDate: { gte: `${months[0]}-01`, lte: `${months[11]}-31` } },
      select: { type: true, reqDate: true, pipeline: { select: { r5: true } } },
    }),
  ]);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  // ---- targets ----
  const teamDefault =
    targets.find((t) => t.scope === 'team' && t.month === '')?.target ?? DEFAULT_TEAM_TARGET;
  const teamTargets: Record<string, number> = {};
  for (const m of months) {
    teamTargets[m] =
      targets.find((t) => t.scope === 'team' && t.month === m)?.target ?? teamDefault;
  }
  const recruiterTarget = new Map<string, number>(
    targets.filter((t) => t.scope === 'recruiter').map((t) => [t.recruiterKey, t.target]),
  );

  // ---- aggregates ----
  const byType: Record<string, PerType> = Object.fromEntries(
    months.map((m) => [m, emptyPerType()]),
  );
  const perRec = new Map<string, Record<string, PerType>>();
  for (const r of rows) {
    const t = r.type as ClosureType;
    if (!CLOSURE_TYPES.includes(t)) continue;
    byType[r.month][t] += r.count;
    const key = r.userId ?? UNASSIGNED;
    const rec = perRec.get(key) ?? Object.fromEntries(months.map((m) => [m, emptyPerType()]));
    rec[r.month][t] += r.count;
    perRec.set(key, rec);
  }

  // Recruiters shown: active consultants + anyone with closures/targets, + unassigned bucket.
  const recIds = new Set<string>();
  for (const u of users) if (u.isActive && u.consultant) recIds.add(u.id);
  for (const k of perRec.keys()) if (k !== UNASSIGNED) recIds.add(k);
  for (const k of recruiterTarget.keys()) recIds.add(k);
  const recruiters = [...recIds]
    .filter((id) => nameOf.has(id))
    .map((id) => ({
      userId: id as string | null,
      name: nameOf.get(id)!,
      target: recruiterTarget.get(id) ?? null,
      perMonth: perRec.get(id) ?? Object.fromEntries(months.map((m) => [m, emptyPerType()])),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (perRec.has(UNASSIGNED)) {
    recruiters.push({
      userId: null,
      name: 'VAYUZ Internal',
      target: null,
      perMonth: perRec.get(UNASSIGNED)!,
    });
  }

  // ---- HDIS cross-check: onboarded (r5) by requirement-date month and category ----
  const hdisOnboarded: Record<string, PerType> = Object.fromEntries(
    months.map((m) => [m, emptyPerType()]),
  );
  for (const h of hdis) {
    const m = h.reqDate?.slice(0, 7);
    const t = h.type as ClosureType;
    if (m && hdisOnboarded[m] && CLOSURE_TYPES.includes(t)) {
      hdisOnboarded[m][t] += h.pipeline?.r5 ?? 0;
    }
  }

  // ---- FY KPIs ----
  const elapsed = months.filter((m) => m <= nowMonth);
  let radc = 0;
  let radf = 0;
  let internal = 0;
  let at80 = 0;
  for (const m of months) {
    radc += byType[m].RADC;
    radf += byType[m].RADF;
    internal += byType[m].Internal;
  }
  for (const m of elapsed) {
    const tgt = teamTargets[m];
    if (tgt > 0 && (byType[m].RADC + byType[m].RADF) / tgt >= BENCHMARK) at80++;
  }
  const targetToDate = elapsed.reduce((s, m) => s + teamTargets[m], 0);

  const entries: ClosureEntry[] = rows.map((r) => ({
    id: r.id,
    month: r.month,
    userId: r.userId,
    recruiterName: r.userId ? (nameOf.get(r.userId) ?? 'Unknown') : 'VAYUZ Internal',
    type: r.type as ClosureType,
    count: r.count,
    client: r.client,
    candidate: r.candidate,
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    fy: fyKey,
    months,
    currentMonth: nowMonth,
    benchmark: BENCHMARK,
    teamDefault,
    teamTargets,
    byType,
    recruiters,
    hdisOnboarded,
    entries,
    kpis: {
      radc,
      radf,
      rapyd: radc + radf,
      internal,
      all: radc + radf + internal,
      monthsElapsed: elapsed.length,
      monthsAt80: at80,
      targetToDate,
      rapydPctOfTarget: targetToDate > 0 ? (radc + radf) / targetToDate : null,
    },
    userOptions: users
      .filter((u) => u.isActive)
      .map((u) => ({ id: u.id, name: u.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

async function assertUser(prisma: PrismaClient, userId: string | null | undefined) {
  if (!userId) return;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!u) throw new BadRequestError('Recruiter not found', 'recruiter_not_found');
}

export async function createClosure(prisma: PrismaClient, input: ClosureInput, actorId: string) {
  await assertUser(prisma, input.userId);
  return prisma.closure.create({
    data: {
      month: input.month,
      userId: input.userId ?? null,
      type: input.type,
      count: input.count,
      client: input.client || null,
      candidate: input.candidate || null,
      createdBy: actorId,
    },
  });
}

export async function updateClosure(prisma: PrismaClient, id: string, input: ClosureInput) {
  const cur = await prisma.closure.findUnique({ where: { id } });
  if (!cur) throw new NotFoundError('Closure entry not found', 'closure_not_found');
  await assertUser(prisma, input.userId);
  return prisma.closure.update({
    where: { id },
    data: {
      month: input.month,
      userId: input.userId ?? null,
      type: input.type,
      count: input.count,
      client: input.client || null,
      candidate: input.candidate || null,
    },
  });
}

export async function deleteClosure(prisma: PrismaClient, id: string) {
  const cur = await prisma.closure.findUnique({ where: { id } });
  if (!cur) throw new NotFoundError('Closure entry not found', 'closure_not_found');
  await prisma.closure.delete({ where: { id } });
  return cur;
}

/** Paste-from-Excel import. All-or-nothing: if any row has an error nothing is written. */
export async function importClosures(
  prisma: PrismaClient,
  text: string,
  dryRun: boolean,
  actorId: string,
) {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const rows = parseImport(text, users);
  const errors = rows.filter((r) => r.error).map((r) => ({ line: r.line, error: r.error! }));
  const valid = rows.filter((r) => !r.error);
  if (errors.length === 0 && !dryRun && valid.length > 0) {
    await prisma.closure.createMany({
      data: valid.map((r) => ({
        month: r.month!,
        userId: r.userId ?? null,
        type: r.type!,
        count: r.count!,
        client: r.client ?? null,
        candidate: r.candidate ?? null,
        createdBy: actorId,
      })),
    });
  }
  return {
    rows: rows.length,
    valid: valid.length,
    errors,
    imported: errors.length === 0 && !dryRun ? valid.length : 0,
  };
}

export async function setTargets(prisma: PrismaClient, input: TargetsInput) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const put = async (scope: string, recruiterKey: string, month: string, v: number | null) => {
      const where = { scope_recruiterKey_month: { scope, recruiterKey, month } };
      if (v === null) await tx.closureTarget.deleteMany({ where: { scope, recruiterKey, month } });
      else
        await tx.closureTarget.upsert({
          where,
          create: { scope, recruiterKey, month, target: v },
          update: { target: v },
        });
    };
    if (input.teamDefault !== undefined) await put('team', '', '', input.teamDefault);
    for (const [m, v] of Object.entries(input.teamMonths ?? {})) await put('team', '', m, v);
    for (const [uid, v] of Object.entries(input.recruiters ?? {}))
      await put('recruiter', uid, '', v);
  });
}
