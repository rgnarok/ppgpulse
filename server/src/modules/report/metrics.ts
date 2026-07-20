/**
 * Derived metrics — exact ports of the prototype functions
 * (personStats, confidence, kpiRating, funnel, statusMix, closureCats).
 */

export interface ReqLite {
  ownerName: string;
  reqDate: string;
  status: string; // 'Active' | 'On Hold' | 'Fulfilled' | 'Closed'
  /** Free-text sub-reason shown alongside On Hold/Fulfilled/Closed, e.g. "Fulfilled by
   * VAYUZ" — null while Active or when no reason was recorded. */
  statusReason?: string | null;
  profiles: number;
  shortlist: number;
  l1: number;
  l2: number;
  l3: number;
  onboard: number;
  jdId: string | null;
  /** HDIS category (RADC/RADF/Internal) — used for the closure RADC/RADF split. */
  type?: string | null;
}

export interface PersonStats {
  reqs: number;
  closed: number;
  profiles: number;
  shortlist: number;
  onboard: number;
  l1: number;
  l2: number;
  l3: number;
}

export function isClosed(r: Pick<ReqLite, 'onboard' | 'status'>): boolean {
  return r.onboard > 0 || r.status === 'Closed' || r.status === 'Fulfilled';
}

/** Aggregate stats over a set of requirements (already period+scope filtered). */
export function personStats(reqs: ReqLite[]): PersonStats {
  const closed = reqs.filter(isClosed).length;
  return {
    reqs: reqs.length,
    closed,
    profiles: reqs.reduce((s, r) => s + r.profiles, 0),
    shortlist: reqs.reduce((s, r) => s + r.shortlist, 0),
    onboard: reqs.reduce((s, r) => s + r.onboard, 0),
    l1: reqs.reduce((s, r) => s + r.l1, 0),
    l2: reqs.reduce((s, r) => s + r.l2, 0),
    l3: reqs.reduce((s, r) => s + r.l3, 0),
  };
}

export interface Confidence {
  score: number;
  band: string;
  factors: [string, number][];
}

/** confidence() port. 0.3·prog + 0.25·short + 0.2·tat + 0.25·conv. */
export function confidence(st: PersonStats): Confidence {
  if (!st.reqs) return { score: 0, band: 'No data', factors: [] };
  const prog = Math.min(100, Math.round((st.shortlist / Math.max(1, st.profiles)) * 250));
  const short = prog;
  const conv = Math.min(100, Math.round((st.onboard / Math.max(1, st.profiles)) * 900));
  const tat = Math.min(100, 40 + Math.round((st.closed / Math.max(1, st.reqs)) * 140));
  const score = Math.round(prog * 0.3 + short * 0.25 + tat * 0.2 + conv * 0.25);
  const band =
    score >= 66 ? 'High confidence' : score >= 40 ? 'Medium confidence' : 'Low confidence';
  return {
    score,
    band,
    factors: [
      ['Pipeline progression', prog],
      ['Shortlist quality', short],
      ['TAT adherence', tat],
      ['Conversion to join', conv],
    ],
  };
}

export interface KpiRating {
  val: number;
  label: string;
}

/** kpiRating() port. */
export function kpiRating(st: PersonStats): KpiRating {
  const s = Math.min(
    4,
    st.closed * 1.1 +
      (st.shortlist > 0 ? 1 : 0) +
      (st.reqs >= 15 ? 1 : 0) +
      (st.profiles > 40 ? 0.6 : 0),
  );
  const r = Math.round(s * 10) / 10;
  return {
    val: r,
    label: r >= 3 ? 'Exceeds' : r >= 2 ? 'On track' : r >= 1 ? 'Needs focus' : 'At risk',
  };
}

export interface FunnelStage {
  code: string;
  label: string;
  actual: number;
  target: number;
}

/** Aggregate R0–R5 funnel with prototype target heuristics. */
export function funnel(st: PersonStats): FunnelStage[] {
  return [
    { code: 'R0', label: 'Profiles', actual: st.profiles, target: Math.max(8, st.reqs * 8) },
    { code: 'R1', label: 'Shortlist', actual: st.shortlist, target: Math.max(3, st.reqs * 3) },
    { code: 'R2', label: 'L1', actual: st.l1, target: Math.max(2, st.reqs * 2) },
    { code: 'R3', label: 'L2', actual: st.l2, target: Math.max(1, st.reqs) },
    { code: 'R4', label: 'L3', actual: st.l3, target: Math.max(1, st.reqs) },
    { code: 'R5', label: 'Onboard', actual: st.onboard, target: Math.max(1, st.reqs) },
  ];
}

export interface StatusReasonSlice {
  /** The bare HDIS status this slice rolls up under — 'Active' | 'On Hold' |
   * 'Fulfilled' | 'Closed'. */
  status: string;
  /** The chart label — the status-reason detail (e.g. "Fulfilled by VAYUZ") when one
   * was recorded, otherwise the bare status. */
  label: string;
  count: number;
}

const STATUS_ORDER = ['Active', 'On Hold', 'Fulfilled', 'Closed'];

/**
 * Status mix broken down by the HDIS status-reason detail rather than just the bare
 * status, so the chart shows what's actually driving each bucket — e.g. "Fulfilled by
 * VAYUZ" vs "Fulfilled by others", "Hold By client" vs "Hold By VAYUZ" — falling back
 * to the bare status when no reason was recorded (or for Active, which has none).
 * Grouped by status in a stable order, then by count (desc) within each status.
 */
export function statusReasonMix(reqs: ReqLite[]): StatusReasonSlice[] {
  const byStatus = new Map<string, Map<string, number>>();
  for (const r of reqs) {
    const label = r.statusReason?.trim() ? r.statusReason : r.status;
    const m = byStatus.get(r.status) ?? new Map<string, number>();
    m.set(label, (m.get(label) ?? 0) + 1);
    byStatus.set(r.status, m);
  }
  const order = [...STATUS_ORDER, ...[...byStatus.keys()].filter((s) => !STATUS_ORDER.includes(s))];
  const out: StatusReasonSlice[] = [];
  for (const status of order) {
    const m = byStatus.get(status);
    if (!m) continue;
    for (const [label, count] of [...m.entries()].sort((a, b) => b[1] - a[1])) {
      out.push({ status, label, count });
    }
  }
  return out;
}

/** Active-requirement-count bucket shown on the team roster's "Load" column. */
export function loadBucket(activeReqs: number): 'LIGHT' | 'OK' | 'OVERLOAD' {
  if (activeReqs <= 4) return 'LIGHT';
  if (activeReqs >= 12) return 'OVERLOAD';
  return 'OK';
}

/** KPI-rating badge shown next to the numeric score (0–4 scale from kpiRating()). */
export function kpiBand(val: number): 'ME' | 'SME' | 'NI' {
  if (val >= 3) return 'ME';
  if (val >= 2.5) return 'SME';
  return 'NI';
}

/** RADC/RADF split of closed requirements via HDIS category. */
export function closureCats(reqs: ReqLite[]): { radc: number; radf: number } {
  let radc = 0;
  let radf = 0;
  for (const r of reqs.filter(isClosed)) {
    if (r.type === 'RADC') radc++;
    else if (r.type === 'RADF') radf++;
  }
  return { radc, radf };
}
