import type { PrismaClient } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { loadDirectory, scopeNames, type CurrentUser } from '../rbac/index.js';
import { resolvePeriod, type PeriodInput } from './period.js';
import {
  personStats,
  confidence,
  kpiRating,
  funnel,
  statusMix,
  closureCats,
  loadBucket,
  kpiBand,
  type ReqLite,
} from './metrics.js';

export interface ScopedConsultant {
  id: string;
  userId: string;
  name: string;
  email: string;
  pod: string;
  team: string;
  eventsHosted: number;
  eventsParticipated: number;
  insights: number;
}

async function scopedConsultants(
  prisma: PrismaClient,
  user: CurrentUser,
): Promise<ScopedConsultant[]> {
  const directory = await loadDirectory(prisma);
  const names = scopeNames(user, directory);
  const consultants = await prisma.consultant.findMany({ include: { user: true } });
  return consultants
    .filter((c) => names.has(c.user.name))
    .map((c) => ({
      id: c.id,
      userId: c.userId,
      name: c.user.name,
      email: c.user.email,
      pod: c.pod,
      team: c.user.team,
      eventsHosted: c.eventsHosted,
      eventsParticipated: c.eventsParticipated,
      insights: c.insights,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function requirementsFor(
  prisma: PrismaClient,
  ownerIds: string[],
  period: { lo: string; hi: string },
): Promise<ReqLite[]> {
  if (!ownerIds.length) return [];
  const reqs = await prisma.requirement.findMany({
    where: { ownerId: { in: ownerIds }, reqDate: { gte: period.lo, lte: period.hi } },
    include: { owner: { include: { user: true } } },
  });
  return reqs.map((r) => ({
    ownerName: r.owner.user.name,
    reqDate: r.reqDate,
    status: r.status,
    profiles: r.profiles,
    shortlist: r.shortlist,
    l1: r.l1,
    l2: r.l2,
    l3: r.l3,
    onboard: r.onboard,
    jdId: r.jdId,
  }));
}

async function catByJd(prisma: PrismaClient): Promise<Map<string, string>> {
  const rows = await prisma.hdis.findMany({ select: { jdId: true, type: true } });
  return new Map(rows.map((h) => [h.jdId, h.type as string]));
}

/** GET /consultants — consultants visible to the caller (scoped). */
export async function listScopedConsultants(prisma: PrismaClient, user: CurrentUser) {
  return scopedConsultants(prisma, user);
}

/** GET /report/roster — one row per scoped consultant, powering the "PPG Team Roster"
 * table (org scope sees everyone, team scope sees their pod). All-time snapshot —
 * this table isn't period-filtered, it's a live "how's everyone doing right now" view. */
export async function teamRoster(prisma: PrismaClient, user: CurrentUser) {
  const directory = await loadDirectory(prisma);
  const names = scopeNames(user, directory);
  const consultants = await prisma.consultant.findMany({
    include: { user: { include: { role: true } } },
  });
  const scoped = consultants
    .filter((c) => names.has(c.user.name))
    .sort((a, b) => a.user.name.localeCompare(b.user.name));
  if (!scoped.length) return [];

  const ids = scoped.map((c) => c.id);
  const allReqs = await prisma.requirement.findMany({ where: { ownerId: { in: ids } } });
  const reqsByOwner = new Map<string, typeof allReqs>();
  for (const id of ids) reqsByOwner.set(id, []);
  for (const r of allReqs) reqsByOwner.get(r.ownerId)?.push(r);

  const scopedNames = scoped.map((c) => c.user.name);
  const hdisOwners = await prisma.hdisOwner.findMany({
    where: { consultantOrName: { in: scopedNames } },
    include: { hdis: { select: { createdAt: true, updatedAt: true } } },
  });
  const today = new Date().toISOString().slice(0, 10);
  const touchedTodayByName = new Set(
    hdisOwners
      .filter(
        (o) =>
          o.hdis.createdAt.toISOString().slice(0, 10) === today ||
          o.hdis.updatedAt.toISOString().slice(0, 10) === today,
      )
      .map((o) => o.consultantOrName),
  );

  const monthPrefix = today.slice(0, 7);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  return scoped.map((c) => {
    const reqs = reqsByOwner.get(c.id) ?? [];
    const st = personStats(
      reqs.map((r) => ({
        ownerName: c.user.name,
        reqDate: r.reqDate,
        status: r.status,
        profiles: r.profiles,
        shortlist: r.shortlist,
        l1: r.l1,
        l2: r.l2,
        l3: r.l3,
        onboard: r.onboard,
        jdId: r.jdId,
      })),
    );
    const kpi = kpiRating(st);
    const activeReqs = reqs.filter((r) => r.status === 'Active').length;
    const onboardMtd = reqs
      .filter((r) => r.reqDate.startsWith(monthPrefix))
      .reduce((s, r) => s + r.onboard, 0);
    const profilesWk = reqs
      .filter((r) => r.reqDate >= weekAgo && r.reqDate <= today)
      .reduce((s, r) => s + r.profiles, 0);
    return {
      id: c.id,
      name: c.user.name,
      role: c.user.role.label,
      activeReqs,
      load: loadBucket(activeReqs),
      onboardMtd,
      onboardTarget: 2,
      profilesWk,
      profilesTarget: 60,
      hdisToday: touchedTodayByName.has(c.user.name),
      kpiVal: kpi.val,
      kpiBand: kpiBand(kpi.val),
    };
  });
}

/** GET /report/overview — 7 tiles + 4 chart series, scoped + period-filtered. */
export async function overview(prisma: PrismaClient, user: CurrentUser, periodInput: PeriodInput) {
  const period = resolvePeriod(periodInput);
  const cons = await scopedConsultants(prisma, user);
  const reqs = await requirementsFor(
    prisma,
    cons.map((c) => c.id),
    period,
  );
  const cats = await catByJd(prisma);

  const byOwner = new Map<string, ReqLite[]>();
  for (const c of cons) byOwner.set(c.name, []);
  for (const r of reqs) byOwner.get(r.ownerName)?.push(r);

  const perConsultant = cons.map((c) => {
    const list = byOwner.get(c.name) ?? [];
    const st = personStats(list);
    return { name: c.name, id: c.id, stats: st, confidence: confidence(st).score };
  });

  const totalReqs = reqs.length;
  const closed = reqs.filter((r) => r.onboard > 0 || r.status === 'Closed').length;
  const cc = closureCats(reqs, cats);
  const insights = cons.reduce((s, c) => s + c.insights, 0);
  const eventsHosted = cons.reduce((s, c) => s + c.eventsHosted, 0);
  const eventsParticipated = cons.reduce((s, c) => s + c.eventsParticipated, 0);

  return {
    period,
    tiles: {
      requirementsReceived: totalReqs,
      totalClosures: closed,
      closureSplit: cc,
      totalRequirements: totalReqs,
      insightsPublished: insights,
      eventsHosted,
      eventsParticipated,
      consultants: cons.length,
    },
    charts: {
      requirementsByConsultant: perConsultant.map((p) => ({ name: p.name, value: p.stats.reqs })),
      statusMix: statusMix(reqs),
      closuresByConsultant: perConsultant.map((p) => ({ name: p.name, value: p.stats.closed })),
      confidenceByConsultant: perConsultant.map((p) => ({ name: p.name, value: p.confidence })),
    },
  };
}

/** GET /report/consultant/:id — confidence, kpi, funnel, requirements (scoped + period). */
export async function consultantReport(
  prisma: PrismaClient,
  user: CurrentUser,
  consultantId: string,
  periodInput: PeriodInput,
) {
  const period = resolvePeriod(periodInput);
  const target = await prisma.consultant.findUnique({
    where: { id: consultantId },
    include: { user: { include: { role: true } } },
  });
  if (!target) throw new NotFoundError('Consultant not found');

  const directory = await loadDirectory(prisma);
  const names = scopeNames(user, directory);
  if (!names.has(target.user.name)) throw new ForbiddenError('Consultant out of scope');

  const reqRows = await prisma.requirement.findMany({
    where: { ownerId: consultantId, reqDate: { gte: period.lo, lte: period.hi } },
    orderBy: { reqDate: 'desc' },
    include: { hdis: { select: { type: true, jdLink: true } } },
  });
  const list: ReqLite[] = reqRows.map((r) => ({
    ownerName: target.user.name,
    reqDate: r.reqDate,
    status: r.status,
    profiles: r.profiles,
    shortlist: r.shortlist,
    l1: r.l1,
    l2: r.l2,
    l3: r.l3,
    onboard: r.onboard,
    jdId: r.jdId,
  }));
  const st = personStats(list);
  const cats = await catByJd(prisma);

  return {
    period,
    consultant: {
      id: target.id,
      name: target.user.name,
      email: target.user.email,
      pod: target.pod,
      role: target.user.role.label,
      eventsHosted: target.eventsHosted,
      eventsParticipated: target.eventsParticipated,
      insights: target.insights,
    },
    stats: st,
    confidence: confidence(st),
    kpi: kpiRating(st),
    funnel: funnel(st),
    closureSplit: closureCats(list, cats),
    requirements: reqRows.map((r) => ({
      id: r.id,
      code: r.code,
      jdId: r.jdId,
      title: r.title,
      client: r.client,
      reqDate: r.reqDate,
      status: r.status,
      profiles: r.profiles,
      shortlist: r.shortlist,
      l1: r.l1,
      l2: r.l2,
      l3: r.l3,
      onboard: r.onboard,
      type: r.hdis?.type ?? null,
      jdLink: r.hdis?.jdLink ?? null,
    })),
  };
}

/** GET /requirements/:id — detail + co-owners on the same JD. */
export async function requirementDetail(prisma: PrismaClient, user: CurrentUser, id: string) {
  const req = await prisma.requirement.findUnique({
    where: { id },
    include: { owner: { include: { user: true } }, hdis: true },
  });
  if (!req) throw new NotFoundError('Requirement not found');

  const directory = await loadDirectory(prisma);
  const names = scopeNames(user, directory);
  if (!names.has(req.owner.user.name)) throw new ForbiddenError('Requirement out of scope');

  // Co-owners: other requirements on the same JD (excluding this one).
  const coOwners = req.jdId
    ? await prisma.requirement.findMany({
        where: { jdId: req.jdId, id: { not: req.id } },
        include: { owner: { include: { user: true } } },
      })
    : [];

  return {
    id: req.id,
    code: req.code,
    jdId: req.jdId,
    title: req.title,
    client: req.client,
    reqDate: req.reqDate,
    status: req.status,
    owner: { id: req.owner.id, name: req.owner.user.name },
    pipeline: {
      profiles: req.profiles,
      shortlist: req.shortlist,
      l1: req.l1,
      l2: req.l2,
      l3: req.l3,
      onboard: req.onboard,
    },
    hdis: req.hdis
      ? { jdId: req.hdis.jdId, title: req.hdis.title, type: req.hdis.type, status: req.hdis.status }
      : null,
    coOwners: coOwners.map((c) => ({
      id: c.id,
      code: c.code,
      ownerName: c.owner.user.name,
      status: c.status,
    })),
  };
}
