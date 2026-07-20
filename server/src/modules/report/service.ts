import type { PrismaClient } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { loadDirectory, scopeNames, type CurrentUser } from '../rbac/index.js';
import { resolvePeriod, inPeriod, type PeriodInput } from './period.js';
import {
  personStats,
  confidence,
  kpiRating,
  funnel,
  statusReasonMix,
  closureCats,
  isClosed,
  loadBucket,
  kpiBand,
  orgFunnel,
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

/** One row per (HDIS record, owner) pair — the live equivalent of the old Requirement
 * table's grain, sourced from HDIS + its pipeline recorder instead of a table nothing
 * in the app ever writes to. `names` are display names, matched the same free-text way
 * HDIS visibility scoping works everywhere else (HdisOwner.consultantOrName). */
interface HdisReqRow {
  jdId: string;
  title: string;
  client: string;
  type: string;
  reqDate: string;
  status: string;
  statusReason: string | null;
  jdLink: string | null;
  ownerName: string;
  createdAt: Date;
  updatedAt: Date;
  profiles: number;
  shortlist: number;
  l1: number;
  l2: number;
  l3: number;
  onboard: number;
}

async function hdisReqRowsFor(prisma: PrismaClient, names: string[]): Promise<HdisReqRow[]> {
  if (!names.length) return [];
  const owners = await prisma.hdisOwner.findMany({
    where: { consultantOrName: { in: names } },
    include: { hdis: { include: { pipeline: true } } },
  });
  return owners.map((o) => {
    const h = o.hdis;
    const p = h.pipeline;
    return {
      jdId: h.jdId,
      title: h.title,
      client: h.client,
      type: h.type as string,
      reqDate: h.reqDate,
      status: h.status,
      statusReason: h.statusReason,
      jdLink: h.jdLink,
      ownerName: o.consultantOrName,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
      profiles: p?.r0 ?? 0,
      shortlist: p?.r1 ?? 0,
      l1: p?.r2 ?? 0,
      l2: p?.r3 ?? 0,
      l3: p?.r4 ?? 0,
      onboard: p?.r5 ?? 0,
    };
  });
}

function toReqLite(row: HdisReqRow): ReqLite {
  return {
    ownerName: row.ownerName,
    reqDate: row.reqDate,
    status: row.status,
    statusReason: row.statusReason,
    profiles: row.profiles,
    shortlist: row.shortlist,
    l1: row.l1,
    l2: row.l2,
    l3: row.l3,
    onboard: row.onboard,
    jdId: row.jdId,
    type: row.type,
  };
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

  const scopedNames = scoped.map((c) => c.user.name);
  const rows = await hdisReqRowsFor(prisma, scopedNames);
  const rowsByName = new Map<string, HdisReqRow[]>();
  for (const n of scopedNames) rowsByName.set(n, []);
  for (const r of rows) rowsByName.get(r.ownerName)?.push(r);

  const today = new Date().toISOString().slice(0, 10);
  const touchedTodayByName = new Set(
    rows
      .filter(
        (r) =>
          r.createdAt.toISOString().slice(0, 10) === today ||
          r.updatedAt.toISOString().slice(0, 10) === today,
      )
      .map((r) => r.ownerName),
  );

  const monthPrefix = today.slice(0, 7);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  return scoped.map((c) => {
    const personRows = rowsByName.get(c.user.name) ?? [];
    const st = personStats(personRows.map(toReqLite));
    const kpi = kpiRating(st);
    const activeReqs = personRows.filter((r) => r.status === 'Active').length;
    const onboardMtd = personRows
      .filter((r) => r.reqDate.startsWith(monthPrefix))
      .reduce((s, r) => s + r.onboard, 0);
    const profilesWk = personRows
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

/** GET /report/overview — 7 tiles + 4 chart series, scoped + period-filtered.
 * When `consultantId` is given, every tile/chart is narrowed to that one person
 * (same response shape as the team-wide view — the UI doesn't have to change). */
export async function overview(
  prisma: PrismaClient,
  user: CurrentUser,
  periodInput: PeriodInput & { consultantId?: string },
) {
  const period = resolvePeriod(periodInput);
  let cons = await scopedConsultants(prisma, user);
  if (periodInput.consultantId) {
    cons = cons.filter((c) => c.id === periodInput.consultantId);
    if (!cons.length) throw new ForbiddenError('Consultant out of scope');
  }
  const allRows = await hdisReqRowsFor(
    prisma,
    cons.map((c) => c.name),
  );
  const reqs = allRows.filter((r) => inPeriod(r.reqDate, period)).map(toReqLite);

  const byOwner = new Map<string, ReqLite[]>();
  for (const c of cons) byOwner.set(c.name, []);
  for (const r of reqs) byOwner.get(r.ownerName)?.push(r);

  const perConsultant = cons.map((c) => {
    const list = byOwner.get(c.name) ?? [];
    const st = personStats(list);
    return { name: c.name, id: c.id, stats: st, confidence: confidence(st).score };
  });

  const totalReqs = reqs.length;
  const closed = reqs.filter(isClosed).length;
  const cc = closureCats(reqs);
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
      statusReasonMix: statusReasonMix(reqs),
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

  const allRows = await hdisReqRowsFor(prisma, [target.user.name]);
  const rows = allRows
    .filter((r) => inPeriod(r.reqDate, period))
    .sort((a, b) => b.reqDate.localeCompare(a.reqDate));
  const list = rows.map(toReqLite);
  const st = personStats(list);

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
    closureSplit: closureCats(list),
    requirements: rows.map((r) => ({
      id: r.jdId,
      code: r.jdId,
      jdId: r.jdId,
      title: r.title,
      client: r.client,
      reqDate: r.reqDate,
      status: r.status,
      statusReason: r.statusReason,
      profiles: r.profiles,
      shortlist: r.shortlist,
      l1: r.l1,
      l2: r.l2,
      l3: r.l3,
      onboard: r.onboard,
      type: r.type,
      jdLink: r.jdLink,
    })),
  };
}

/** GET /requirements/:id — requirement (HDIS record) detail + co-owners on the same JD.
 * `id` is the HDIS jdId — requirements are HDIS-record-and-owner pairs, not rows in a
 * separate table, so a JD's "co-owners" are simply its other listed HDIS owners. */
export async function requirementDetail(prisma: PrismaClient, user: CurrentUser, jdId: string) {
  const h = await prisma.hdis.findUnique({
    where: { jdId },
    include: { owners: true, pipeline: true },
  });
  if (!h) throw new NotFoundError('Requirement not found');

  const directory = await loadDirectory(prisma);
  const names = scopeNames(user, directory);
  const visible = h.owners.some((o) => names.has(o.consultantOrName));
  if (!visible) throw new ForbiddenError('Requirement out of scope');

  const p = h.pipeline;
  const [primaryOwner, ...coOwners] = h.owners;

  return {
    id: h.jdId,
    code: h.jdId,
    jdId: h.jdId,
    title: h.title,
    client: h.client,
    reqDate: h.reqDate,
    status: h.status,
    owner: primaryOwner ? { id: primaryOwner.id, name: primaryOwner.consultantOrName } : null,
    pipeline: {
      profiles: p?.r0 ?? 0,
      shortlist: p?.r1 ?? 0,
      l1: p?.r2 ?? 0,
      l2: p?.r3 ?? 0,
      l3: p?.r4 ?? 0,
      onboard: p?.r5 ?? 0,
    },
    hdis: { jdId: h.jdId, title: h.title, type: h.type, status: h.status },
    coOwners: coOwners.map((o) => ({
      id: o.id,
      code: h.jdId,
      ownerName: o.consultantOrName,
      status: h.status,
    })),
  };
}

/** A record is "live" (still open work, not yet resolved) when its status hasn't
 * reached Fulfilled or Closed — mirrors isClosed()'s bucketing but at the bare-status
 * level, since the Dhruva tiles work off whole HDIS records rather than per-owner rows. */
function isLiveStatus(status: string): boolean {
  return status !== 'Fulfilled' && status !== 'Closed';
}

export interface DhruvaFilters {
  /** Narrows the funnel + its drop-off %s only — the headline tiles (RAPYD Active,
   * Active Clients, Priority split) always reflect the whole live dataset, same as
   * the "always full dataset" convention used by the HDIS list's headline cards. */
  priority?: string;
  client?: string;
  ppg?: string;
  from?: string;
  to?: string;
}

/** GET /report/dhruva — super-admin-only org-wide operations dashboard: RAPYD Active
 * split, Active Clients, Interviews Today split, Priority (P1/P2/P3/Uncategorised)
 * tiles, the org-wide R0-R5 funnel (filterable), and Top Clients by people deployed. */
export async function dhruvaDashboard(
  prisma: PrismaClient,
  user: CurrentUser,
  filters: DhruvaFilters,
) {
  const directory = await loadDirectory(prisma);
  const names = scopeNames(user, directory);
  const rows = await prisma.hdis.findMany({
    where: { owners: { some: { consultantOrName: { in: [...names] } } } },
    include: { owners: true, pipeline: true },
  });

  const rapyd = { total: 0, radc: 0, radf: 0 };
  const priority = { p1: 0, p2: 0, p3: 0, uncategorised: 0 };
  const clientAgg = new Map<string, { radc: number; radf: number }>();
  for (const h of rows) {
    if (!isLiveStatus(h.status)) continue;
    rapyd.total++;
    if (h.type === 'RADC') rapyd.radc++;
    else if (h.type === 'RADF') rapyd.radf++;

    if (h.priority === 'P1') priority.p1++;
    else if (h.priority === 'P2') priority.p2++;
    else if (h.priority === 'P3') priority.p3++;
    else priority.uncategorised++;
  }
  const activeClients = new Set(rows.filter((h) => isLiveStatus(h.status)).map((h) => h.client))
    .size;

  // Top Clients — people deployed (R5/onboard) per client, split RADC/RADF — counts
  // across the whole dataset (closed records included; a past deployment still counts
  // as someone placed at that client), unaffected by the funnel filters below.
  for (const h of rows) {
    if (h.type !== 'RADC' && h.type !== 'RADF') continue;
    const deployed = h.pipeline?.r5 ?? 0;
    if (!deployed) continue;
    const cur = clientAgg.get(h.client) ?? { radc: 0, radf: 0 };
    if (h.type === 'RADC') cur.radc += deployed;
    else cur.radf += deployed;
    clientAgg.set(h.client, cur);
  }
  const rankClients = (pick: (v: { radc: number; radf: number }) => number) =>
    [...clientAgg.entries()]
      .map(([client, v]) => ({ client, deployed: pick(v) }))
      .filter((c) => c.deployed > 0)
      .sort((a, b) => b.deployed - a.deployed)
      .slice(0, 5);
  const topClients = {
    radc: rankClients((v) => v.radc),
    radf: rankClients((v) => v.radf),
  };

  // Funnel — filterable by priority/client/PPG owner/date range.
  const funnelRows = rows.filter((h) => {
    if (filters.priority && h.priority !== filters.priority) return false;
    if (filters.client && h.client !== filters.client) return false;
    if (filters.ppg && !h.owners.some((o) => o.consultantOrName === filters.ppg)) return false;
    if (filters.from && h.reqDate < filters.from) return false;
    if (filters.to && h.reqDate > filters.to) return false;
    return true;
  });
  const sums = funnelRows.reduce(
    (acc, h) => {
      const p = h.pipeline;
      acc.r0 += p?.r0 ?? 0;
      acc.r1 += p?.r1 ?? 0;
      acc.r2 += p?.r2 ?? 0;
      acc.r3 += p?.r3 ?? 0;
      acc.r4 += p?.r4 ?? 0;
      acc.r5 += p?.r5 ?? 0;
      return acc;
    },
    { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 },
  );

  // Interviews today — org-wide, split RAPYD(C)/RAPYD(F) to match the Type field's
  // free-text values used on the Interviews form.
  const today = new Date().toISOString().slice(0, 10);
  const todaysInterviews = await prisma.interview.findMany({ where: { date: today } });
  const interviewsToday = { total: todaysInterviews.length, radc: 0, radf: 0 };
  for (const iv of todaysInterviews) {
    if (iv.type === 'RAPYD(C)') interviewsToday.radc++;
    else if (iv.type === 'RAPYD(F)') interviewsToday.radf++;
  }

  return {
    rapyd,
    activeClients,
    interviewsToday,
    priority,
    funnel: orgFunnel(sums),
    funnelTotal: funnelRows.length,
    topClients,
  };
}
