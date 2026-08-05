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
  rapydActiveCounts,
  type ReqLite,
} from './metrics.js';
import { computeAging, average, TRANSITIONS, type Transition } from '../hdis/aging.js';

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
  priority: string;
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
  openings: number;
  stageEvents: { stage: string; at: Date }[];
}

async function hdisReqRowsFor(prisma: PrismaClient, names: string[]): Promise<HdisReqRow[]> {
  if (!names.length) return [];
  const owners = await prisma.hdisOwner.findMany({
    where: { consultantOrName: { in: names } },
    include: { hdis: { include: { pipeline: true, stageEvents: true } } },
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
      priority: h.priority,
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
      openings: h.openings,
      stageEvents: h.stageEvents.map((e) => ({ stage: e.stage, at: e.at })),
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

  // Priority split — live (not yet closed) requirements owned by this person, same
  // "P1/P2/P3/Uncategorised" bucketing as the org-wide Dhruva tiles, scoped to one
  // consultant and the same period as the rest of this page.
  const priority = { p1: 0, p2: 0, p3: 0, uncategorised: 0 };
  for (const r of rows) {
    if (isClosed(toReqLite(r))) continue;
    if (r.priority === 'P1') priority.p1++;
    else if (r.priority === 'P2') priority.p2++;
    else if (r.priority === 'P3') priority.p3++;
    else priority.uncategorised++;
  }

  // Profile aging — how long this person's requirements take to move through
  // R0->R5 (see aging.ts). `overall` is the average total days across every
  // requirement in this period; `byTransition` breaks that down per stage-to-stage
  // hop, powering the individual dashboard's stage filter.
  const now = new Date();
  const agings = rows.map((r) =>
    computeAging(r.reqDate, r.stageEvents, now, isClosed(toReqLite(r))),
  );
  const aging = {
    overall: average(agings.map((a) => a.totalDays)),
    byTransition: Object.fromEntries(
      TRANSITIONS.map((t) => [t, average(agings.map((a) => a.transitions[t]))]),
    ) as Record<Transition, number | null>,
  };

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
    priority,
    aging,
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
      openings: r.openings,
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
 * level, since the Dhruva tiles work off whole HDIS records rather than per-owner rows.
 * Excludes "Pending" too — a requirement whose intake questionnaire isn't complete yet
 * isn't live work. */
function isLiveStatus(status: string): boolean {
  return status !== 'Fulfilled' && status !== 'Closed' && status !== 'Pending';
}

export interface DhruvaFilters {
  /** Narrows the funnel (and its drop-off %s) only — does not affect the headline
   * tiles, which are scoped by period alone (see `from`/`to`/`month`/`fy` below). */
  priority?: string;
  client?: string;
  ppg?: string;
  /** Period narrowing — same precedence as the rest of the report module
   * (explicit from/to > month > fy > current fiscal year default), resolved via
   * resolvePeriod() and applied to reqDate. Scopes both the headline tiles and the
   * funnel below. */
  from?: string;
  to?: string;
  month?: string;
  fy?: string;
}

/** GET /report/dhruva — super-admin-only org-wide operations dashboard: RAPYD Active
 * split, Active Clients, Interviews Today split, Priority (P1/P2/P3/Uncategorised)
 * tiles, the org-wide R0-R5 funnel, and Top Clients by people deployed — all scoped
 * to the resolved period except Top Clients (all-time) and Interviews Today
 * (always "today"). The funnel is additionally filterable by priority/client/PPG. */
export async function dhruvaDashboard(
  prisma: PrismaClient,
  user: CurrentUser,
  filters: DhruvaFilters,
) {
  // Dhruva is an org-wide dashboard (RBAC-gated to org-scope roles only — see
  // seed.json's role grants), so it should see every HDIS record, not just ones
  // whose owner name happens to match a current user account. Narrowing by
  // scopeNames() here (as team/own-scoped views elsewhere in this module do) was a
  // bug: any record with a legacy/free-text owner name that doesn't match a live
  // user account (or no owners at all) was silently dropped from every Dhruva
  // number — mirrors the same org-scope bypass hdis/service.ts's visibilityWhere()
  // already uses for the HDIS list, so this dashboard's totals reconcile with it.
  const rows =
    user.role.scope === 'org'
      ? await prisma.hdis.findMany({ include: { owners: true, pipeline: true } })
      : await (async () => {
          const directory = await loadDirectory(prisma);
          const names = scopeNames(user, directory);
          return prisma.hdis.findMany({
            where: { owners: { some: { consultantOrName: { in: [...names] } } } },
            include: { owners: true, pipeline: true },
          });
        })();

  // Period — explicit dates, a month, or a fiscal year (same precedence as the
  // rest of the report module), applied to reqDate. Drives every headline tile
  // below (RAPYD Active, Total Live Requirements, Priority, Active Clients) as well
  // as the funnel, so picking "July" on the page actually scopes what you see —
  // only Top Clients (people deployed, an all-time record) and Interviews Today
  // (already "today" by definition) stay unscoped.
  const period = resolvePeriod({
    from: filters.from,
    to: filters.to,
    month: filters.month,
    fy: filters.fy,
  });
  const periodRows = rows.filter((h) => inPeriod(h.reqDate, period));

  // "RAPYD Active" is specifically RADC (live contract) + RADF (full-time) positions —
  // Internal records are live requirements too, but aren't RAPYD placements, so they're
  // excluded here (they still count toward Active Clients and Priority below).
  const rapyd = rapydActiveCounts(periodRows);
  const priority = { p1: 0, p2: 0, p3: 0, uncategorised: 0 };
  const clientAgg = new Map<string, { radc: number; radf: number }>();
  let internalLive = 0;
  for (const h of periodRows) {
    if (!isLiveStatus(h.status)) continue;
    if (h.priority === 'P1') priority.p1++;
    else if (h.priority === 'P2') priority.p2++;
    else if (h.priority === 'P3') priority.p3++;
    else priority.uncategorised++;
    if (h.type === 'Internal') internalLive++;
  }
  // Deliberately literal status === 'Active' here (not isLiveStatus's broader
  // Active-or-On-Hold "live" definition) — a client whose only requirement is On
  // Hold isn't a client we're actively working for right now.
  const activeClients = new Set(
    periodRows.filter((h) => h.status === 'Active').map((h) => h.client),
  ).size;

  // Total live requirement segregation — RAPYD Active (RADC+RADF) alone doesn't equal
  // total live requirements because Internal-type records are live too; break out all
  // three so the totals reconcile (radc + radf + internal === total).
  const segregation = {
    total: rapyd.radc + rapyd.radf + internalLive,
    radc: rapyd.radc,
    radf: rapyd.radf,
    internal: internalLive,
  };

  // Top Clients — people deployed (R5/onboard) per client, split RADC/RADF — counts
  // across the whole dataset (closed records included; a past deployment still counts
  // as someone placed at that client), unaffected by the period/funnel filters.
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

  // Funnel — same period as above, additionally filterable by priority/client/PPG
  // owner (funnel-only narrowing, doesn't affect the headline tiles above).
  const funnelRows = periodRows.filter((h) => {
    if (filters.priority && h.priority !== filters.priority) return false;
    if (filters.client && h.client !== filters.client) return false;
    if (filters.ppg && !h.owners.some((o) => o.consultantOrName === filters.ppg)) return false;
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

  // Closure Target — org-wide RADC+RADF closures within the resolved period vs. a
  // single editable target (reuses the Kpi.numericTarget field via a dedicated
  // 'closures_period' tracked KPI, edited the same way as any other KPI default target).
  const closureKpi = await prisma.kpi.findFirst({ where: { trackedMetric: 'closures_period' } });
  const closureActual = closureCats(
    funnelRows.map((h) => ({
      ownerName: '',
      reqDate: h.reqDate,
      status: h.status,
      statusReason: null,
      profiles: 0,
      shortlist: 0,
      l1: 0,
      l2: 0,
      l3: 0,
      onboard: h.pipeline?.r5 ?? 0,
      jdId: h.jdId,
      type: h.type,
    })),
  );
  const closureTarget = {
    kpiId: closureKpi?.id ?? null,
    target: closureKpi?.numericTarget ?? 0,
    actual: closureActual.radc + closureActual.radf,
    radc: closureActual.radc,
    radf: closureActual.radf,
  };

  return {
    rapyd,
    segregation,
    activeClients,
    interviewsToday,
    priority,
    funnel: orgFunnel(sums),
    funnelTotal: funnelRows.length,
    topClients,
    closureTarget,
  };
}

// ---------------------------------------------------------------------------
// Performance Scorecard — highlights the period's top performers across a set of
// recruiting metrics. Sourced from Hdis + HdisPipeline (aggregate R0-R5 headcounts)
// plus stage-entry events for aging, NOT from named per-candidate records — HDIS
// doesn't track individual candidates, only per-requirement stage counts. See the
// formula notes on scorecardDashboard() below for exactly what that means for each
// metric and where the approximations are.
// ---------------------------------------------------------------------------

export type ScorecardFilters = PeriodInput;

/** A requirement only counts toward dropout-rate / TAT once it's actually finished —
 * while it's still Active/On Hold/Pending, an unfilled gap between R0 and R5 might
 * still convert, so it isn't a "dropout" yet, and its aging hasn't ended yet either. */
const SCORECARD_TERMINAL_STATUSES = new Set(['Closed', 'Fulfilled']);

/** Min-max normalize `value` to a 0-1 band against the full requirement set for this
 * period — "best in period" always scores 1 regardless of the metric's absolute
 * scale, so the metrics below can be combined into one composite score. Returns 0 for
 * a null value or when every recruiter has the same value (nothing to compare). */
function normalize(value: number | null, all: (number | null)[]): number {
  if (value == null) return 0;
  const finite = all.filter((v): v is number => v != null);
  if (finite.length === 0) return 0;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (max === min) return 1;
  return (value - min) / (max - min);
}

export interface ScorecardRow {
  ownerName: string;
  profilesSubmitted: number;
  closures: number;
  closureEfficiency: number | null;
  l2Conversions: number;
  l3Conversions: number;
  dropped: number;
  dropoutRate: number | null;
  avgTatDays: number | null;
  offered: number;
  interviewToOfferRatio: number | null;
  offerToJoinRatio: number | null;
  score: number | null;
  rank: number | null;
}

interface ScorecardHighlight {
  ownerName: string;
  value: number;
}

/** Highest `pick(row)` (or lowest, with direction:'min') among rows where `eligible`
 * holds and the picked value isn't null. Ties keep whichever recruiter is encountered
 * first. Returns null if nobody in the period qualifies. */
function topBy(
  rows: ScorecardRow[],
  pick: (r: ScorecardRow) => number | null,
  eligible: (r: ScorecardRow) => boolean = () => true,
  direction: 'max' | 'min' = 'max',
): ScorecardHighlight | null {
  let best: ScorecardHighlight | null = null;
  for (const r of rows) {
    if (!eligible(r)) continue;
    const v = pick(r);
    if (v == null) continue;
    if (!best || (direction === 'max' ? v > best.value : v < best.value)) {
      best = { ownerName: r.ownerName, value: v };
    }
  }
  return best;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Performance Scorecard — one row per recruiter (an HDIS requirement's owner), scoped
 * to every requirement *raised* within the resolved period (reqDate — mirrors
 * Dhruva's period scoping). Every metric is derived from each requirement's Pipeline
 * (aggregate R0-R5 headcounts) rather than named candidates, since that's the only
 * data HDIS actually tracks. A requirement with N co-owners has every one of its
 * counts split evenly N ways — there's no way to know which owner sourced which
 * portion of an aggregate count, so this is an even-split approximation, not a
 * measurement. Requirements with no owners at all don't contribute to anyone.
 *
 * Metric definitions:
 *  - profilesSubmitted = pipeline.r0 (profiles shared) share
 *  - l2Conversions / l3Conversions = pipeline.r3 (L2) / r4 (L3) share
 *  - closures = pipeline.r5 (Onboarded) share; closureEfficiency = closures / profilesSubmitted
 *  - interviewToOfferRatio and offerToJoinRatio are PROXIES: Pipeline has no "Offer"
 *    stage, so r4 (L3 reached) stands in for "offered" and r2 (L1 reached) stands in
 *    for "interviewed". Read these as L1-to-L3 and L3-to-Onboarded conversion, not a
 *    literal offer rate.
 *  - dropoutRate = (r0 - r5) / r0, but ONLY computed from requirements that are
 *    already Closed/Fulfilled — for a requirement still open, an r0-r5 gap might
 *    still convert, so it isn't a dropout yet.
 *  - avgTatDays = mean of each Closed/Fulfilled requirement's total R0->R5 aging (the
 *    same aging.ts used on the HDIS detail page), one full value per owner — not
 *    split by ownership share, since a duration isn't a count.
 *
 * The overall ranking is a composite of 7 of those metrics, each min-max normalized
 * to 0-1 within the period and weighted: closure efficiency 20%, L2/L3 conversions
 * 15% each, interview-to-offer 15%, offer-to-join 15%, dropout rate (inverted — lower
 * is better) 10%, TAT (inverted — lower is better) 10%. Recruiters with zero
 * submitted profiles in the period aren't ranked.
 */
export async function scorecardDashboard(
  prisma: PrismaClient,
  user: CurrentUser,
  filters: ScorecardFilters,
) {
  const period = resolvePeriod(filters);

  const requirements =
    user.role.scope === 'org'
      ? await prisma.hdis.findMany({
          include: { owners: true, pipeline: true, stageEvents: true },
        })
      : await (async () => {
          const directory = await loadDirectory(prisma);
          const names = scopeNames(user, directory);
          return prisma.hdis.findMany({
            where: { owners: { some: { consultantOrName: { in: [...names] } } } },
            include: { owners: true, pipeline: true, stageEvents: true },
          });
        })();

  const periodReqs = requirements.filter((r) => inPeriod(r.reqDate, period));

  interface Agg {
    ownerName: string;
    profilesSubmitted: number;
    l1Reached: number;
    l2Conversions: number;
    l3Conversions: number;
    offered: number;
    closures: number;
    finishedSubmitted: number;
    finishedClosures: number;
    dropped: number;
    tatDays: number[];
    techStack: Map<string, number>; // techStack -> closures credited
  }
  const byOwner = new Map<string, Agg>();
  function agg(ownerName: string): Agg {
    let a = byOwner.get(ownerName);
    if (!a) {
      a = {
        ownerName,
        profilesSubmitted: 0,
        l1Reached: 0,
        l2Conversions: 0,
        l3Conversions: 0,
        offered: 0,
        closures: 0,
        finishedSubmitted: 0,
        finishedClosures: 0,
        dropped: 0,
        tatDays: [],
        techStack: new Map(),
      };
      byOwner.set(ownerName, a);
    }
    return a;
  }

  const now = new Date();
  for (const r of periodReqs) {
    const ownerNames = r.owners.map((o) => o.consultantOrName);
    if (ownerNames.length === 0) continue;
    const share = 1 / ownerNames.length;
    const p = r.pipeline ?? { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
    const terminal = SCORECARD_TERMINAL_STATUSES.has(r.status);

    let tatDaysForReq: number | null = null;
    if (terminal) {
      tatDaysForReq = computeAging(r.reqDate, r.stageEvents, now, true).totalDays;
    }

    for (const ownerName of ownerNames) {
      const a = agg(ownerName);
      a.profilesSubmitted += p.r0 * share;
      a.l1Reached += p.r2 * share;
      a.l2Conversions += p.r3 * share;
      a.l3Conversions += p.r4 * share;
      a.offered += p.r4 * share; // proxy — see doc comment above
      a.closures += p.r5 * share;
      if (terminal) {
        a.finishedSubmitted += p.r0 * share;
        a.finishedClosures += p.r5 * share;
        a.dropped += Math.max(0, p.r0 - p.r5) * share;
      }
      if (tatDaysForReq != null) a.tatDays.push(tatDaysForReq);
      if (r.techStack && p.r5 > 0) {
        const tech = r.techStack.trim();
        if (tech) a.techStack.set(tech, (a.techStack.get(tech) ?? 0) + p.r5 * share);
      }
    }
  }

  const rows: ScorecardRow[] = [...byOwner.values()]
    .map((a) => ({
      ownerName: a.ownerName,
      profilesSubmitted: round1(a.profilesSubmitted),
      closures: round1(a.closures),
      closureEfficiency: a.profilesSubmitted > 0 ? a.closures / a.profilesSubmitted : null,
      l2Conversions: round1(a.l2Conversions),
      l3Conversions: round1(a.l3Conversions),
      dropped: round1(a.dropped),
      dropoutRate: a.finishedSubmitted > 0 ? a.dropped / a.finishedSubmitted : null,
      avgTatDays: a.tatDays.length > 0 ? average(a.tatDays) : null,
      offered: round1(a.offered),
      interviewToOfferRatio: a.l1Reached > 0 ? a.offered / a.l1Reached : null,
      offerToJoinRatio: a.offered > 0 ? a.closures / a.offered : null,
      score: null,
      rank: null,
    }))
    .sort((a, b) => a.ownerName.localeCompare(b.ownerName));

  const effValues = rows.map((r) => r.closureEfficiency);
  const l2Values = rows.map((r): number | null => r.l2Conversions);
  const l3Values = rows.map((r): number | null => r.l3Conversions);
  const i2oValues = rows.map((r) => r.interviewToOfferRatio);
  const o2jValues = rows.map((r) => r.offerToJoinRatio);
  const dropoutValues = rows.map((r) => (r.dropoutRate != null ? -r.dropoutRate : null));
  const tatValues = rows.map((r) => (r.avgTatDays != null ? -r.avgTatDays : null));

  for (const [i, r] of rows.entries()) {
    if (r.profilesSubmitted === 0) continue;
    r.score =
      0.2 * normalize(effValues[i], effValues) +
      0.15 * normalize(l2Values[i], l2Values) +
      0.15 * normalize(l3Values[i], l3Values) +
      0.15 * normalize(i2oValues[i], i2oValues) +
      0.15 * normalize(o2jValues[i], o2jValues) +
      0.1 * normalize(r.dropoutRate != null ? -r.dropoutRate : null, dropoutValues) +
      0.1 * normalize(r.avgTatDays != null ? -r.avgTatDays : null, tatValues);
  }
  const ranked = rows
    .filter((r) => r.score != null)
    .sort((a, b) => (b.score as number) - (a.score as number));
  ranked.forEach((r, i) => (r.rank = i + 1));
  const ranking = [...ranked, ...rows.filter((r) => r.score == null)];

  const highlights = {
    closureEfficiency: topBy(
      rows,
      (r) => r.closureEfficiency,
      (r) => r.profilesSubmitted > 0,
    ),
    l2Conversions: topBy(rows, (r) => r.l2Conversions),
    l3Conversions: topBy(rows, (r) => r.l3Conversions),
    lowestTat: topBy(
      rows,
      (r) => r.avgTatDays,
      (r) => r.avgTatDays != null,
      'min',
    ),
    lowestDropoutRate: topBy(
      rows,
      (r) => r.dropoutRate,
      (r) => r.dropoutRate != null,
      'min',
    ),
    highestDropoutRate: topBy(
      rows,
      (r) => r.dropoutRate,
      (r) => r.dropoutRate != null,
      'max',
    ),
    interviewToOfferRatio: topBy(
      rows,
      (r) => r.interviewToOfferRatio,
      (r) => r.interviewToOfferRatio != null,
    ),
    offerToJoinRatio: topBy(
      rows,
      (r) => r.offerToJoinRatio,
      (r) => r.offerToJoinRatio != null,
    ),
  };

  // Tech-stack expertise — per stack, whoever has the most credited closures against
  // it this period (see the r.techStack requirement-level field). Only requirements
  // with at least one onboard and a tech stack tag contribute.
  const stackAgg = new Map<string, Map<string, number>>();
  for (const a of byOwner.values()) {
    for (const [stack, count] of a.techStack) {
      const m = stackAgg.get(stack) ?? new Map<string, number>();
      m.set(a.ownerName, (m.get(a.ownerName) ?? 0) + count);
      stackAgg.set(stack, m);
    }
  }
  const techStackExpertise = [...stackAgg.entries()]
    .map(([techStack, owners]) => {
      const top = [...owners.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        techStack,
        topOwnerName: top[0],
        closures: round1(top[1]),
        totalClosures: round1([...owners.values()].reduce((s, v) => s + v, 0)),
      };
    })
    .sort((a, b) => b.totalClosures - a.totalClosures);

  return {
    period,
    highlights,
    ranking,
    techStackExpertise,
    recruiterCount: rows.length,
    // "Candidates" here means requirements contributing to the period, i.e. the
    // denominator the empty-state check on the frontend uses — kept as the same
    // field name/shape the frontend already expects.
    candidateCount: periodReqs.filter((r) => r.owners.length > 0).length,
  };
}
