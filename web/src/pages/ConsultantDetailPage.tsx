import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Card, SectionTitle, Pill, KpiCard, RingGauge } from '../components/ui';
import { DonutChart, VBarChart } from '../components/charts';
import { useConsultantReport, type PeriodParams } from '../lib/hooks';
import { formatDate, formatMonth } from '../lib/format';
import type { ConsultantReport } from '../lib/types';

// All five gauges (overall score + the four contributing factors) render at this one
// size so nothing on the banner reads as more or less important than another metric.
// Sized up from the original 104/72px mix, plus larger labels below, so the whole
// banner is legible at a glance without leaning in — not just for low-vision users,
// but for anyone glancing at a dashboard on a shared screen or TV.
const GAUGE_SIZE = 128;
const GAUGE_THICKNESS = 13;

function ConfidenceBanner({ report }: { report: ConsultantReport }) {
  const c = report.consultant;
  return (
    <Card>
      <SectionTitle color="var(--violet)">Overall Confidence — {c.name}</SectionTitle>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-evenly',
          flexWrap: 'wrap',
          marginTop: 24,
        }}
      >
        <div style={{ textAlign: 'center', width: GAUGE_SIZE }}>
          <RingGauge
            value={report.confidence.score}
            size={GAUGE_SIZE}
            thickness={GAUGE_THICKNESS}
          />
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 10 }}>
            {report.confidence.band}
          </div>
        </div>
        {report.confidence.factors.map(([label, val]) => (
          <div key={label} style={{ textAlign: 'center', width: GAUGE_SIZE }}>
            <RingGauge value={val} size={GAUGE_SIZE} thickness={GAUGE_THICKNESS} />
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 10 }}>{label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function KpiTilesRow({ report }: { report: ConsultantReport }) {
  const t = report.stats;
  const c = report.consultant;
  return (
    <>
      <div className="grid g-4" style={{ marginTop: 16, marginBottom: 16 }}>
        <KpiCard
          tone="blue"
          icon="▤"
          label="Total Requirements Received"
          value={t.reqs}
          sub="raised in this period"
        />
        <KpiCard
          tone="sky"
          icon="✓"
          label="Total Closures Achieved"
          value={t.closed}
          sub={`${report.closureSplit.radc} RADC · ${report.closureSplit.radf} RADF`}
        />
        <KpiCard tone="sand" icon="◔" label="Attendance" value="—" sub="not captured in Q1 sheet" />
        <KpiCard
          tone="gold"
          icon="◆"
          label="Events Hosted"
          value={c.eventsHosted}
          sub="sessions led"
        />
      </div>
      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <KpiCard
          tone="green"
          icon="◇"
          label="Events Participated"
          value={c.eventsParticipated}
          sub="attended"
        />
        <KpiCard
          tone="violet"
          icon="✎"
          label="Insights Published"
          value={c.insights}
          sub="articles / notes"
        />
        <KpiCard
          tone="teal"
          icon="★"
          label="KPI Rating"
          value={`${report.kpi.label} · ${report.kpi.val}`}
          sub={`${report.kpi.val}/4`}
        />
      </div>
    </>
  );
}

/** Wraps a KpiCard so the whole tile is a keyboard-accessible click target — used to
 * jump into the HDIS list pre-filtered to this consultant + priority (mirrors Dhruva's
 * ClickableTile). */
function ClickableTile({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      {children}
    </div>
  );
}

/** P1/P2/P3/Uncategorised — this consultant's live (not yet closed) requirement
 * priority split, same bucketing as Dhruva's org-wide tiles but scoped to one person
 * and the page's period filter. Each tile jumps into the HDIS list pre-filtered to
 * this person + that priority. */
function PriorityTiles({ report }: { report: ConsultantReport }) {
  const navigate = useNavigate();
  const priority = report.priority;
  const total = priority.p1 + priority.p2 + priority.p3 + priority.uncategorised || 1;
  const pct = (n: number) => `${Math.round((n / total) * 100)}% of live`;
  // Only Active (not On Hold) — mirrors Dhruva's priority tiles: a deliberately
  // narrower, actionability-focused scope than the "live" (Active + On Hold) count
  // shown on the tile itself.
  const goTo = (p: string) => () =>
    navigate(
      `/hdis?priority=${p}&owner=${encodeURIComponent(report.consultant.name)}&status=Active`,
    );
  return (
    <div className="grid g-4" style={{ marginBottom: 16 }}>
      <ClickableTile onClick={goTo('P1')}>
        <KpiCard
          tone="sand"
          icon="●"
          label="P1 — Assigned"
          value={priority.p1}
          sub={pct(priority.p1)}
        />
      </ClickableTile>
      <ClickableTile onClick={goTo('P2')}>
        <KpiCard
          tone="gold"
          icon="●"
          label="P2 — Assigned"
          value={priority.p2}
          sub={pct(priority.p2)}
        />
      </ClickableTile>
      <ClickableTile onClick={goTo('P3')}>
        <KpiCard
          tone="sky"
          icon="●"
          label="P3 — Assigned"
          value={priority.p3}
          sub={pct(priority.p3)}
        />
      </ClickableTile>
      <ClickableTile onClick={goTo('NA')}>
        <KpiCard
          tone="blue"
          icon="○"
          label="Uncategorised"
          value={priority.uncategorised}
          sub={pct(priority.uncategorised)}
        />
      </ClickableTile>
    </div>
  );
}

const AGING_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'overall', label: 'Overall (R0 → R5)' },
  { value: 'R0->R1', label: 'R0 → R1' },
  { value: 'R1->R2', label: 'R1 → R2' },
  { value: 'R2->R3', label: 'R2 → R3' },
  { value: 'R3->R4', label: 'R3 → R4' },
  { value: 'R4->R5', label: 'R4 → R5' },
];

/** Average Profile Aging — how long this person's requirements take to move through
 * the pipeline, with a filter to switch between the overall R0->R5 average and any
 * single stage-to-stage transition (e.g. "how long does R1 -> R2 typically take for
 * the profiles this person has worked"). */
function AgingCard({ report }: { report: ConsultantReport }) {
  const [stage, setStage] = useState('overall');
  const value =
    stage === 'overall'
      ? report.aging.overall
      : report.aging.byTransition[stage as keyof typeof report.aging.byTransition];
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <SectionTitle color="var(--teal)">Average Profile Aging</SectionTitle>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="cd-aging-stage" style={{ display: 'none' }}>
            Stage
          </label>
          <select id="cd-aging-stage" value={stage} onChange={(e) => setStage(e.target.value)}>
            {AGING_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--teal)' }}>
          {value === null ? '—' : value}
        </span>
        <span className="skc-sub">
          {value === null ? 'no data for this stage yet' : 'avg. days'}
        </span>
      </div>
    </Card>
  );
}

const STATUS_ORDER = ['Active', 'On Hold', 'Fulfilled', 'Closed'];

/** Same status-reason breakdown rule used server-side (metrics.ts's statusReasonMix),
 * computed client-side over the already-fetched requirements list — shows what's
 * actually driving each bucket (e.g. "Fulfilled by VAYUZ" vs "Fulfilled by others")
 * instead of just the bare status. */
function statusReasonMixOf(requirements: ConsultantReport['requirements']) {
  const byStatus = new Map<string, Map<string, number>>();
  for (const r of requirements) {
    const label = r.statusReason?.trim() ? r.statusReason : r.status;
    const m = byStatus.get(r.status) ?? new Map<string, number>();
    m.set(label, (m.get(label) ?? 0) + 1);
    byStatus.set(r.status, m);
  }
  const order = [...STATUS_ORDER, ...[...byStatus.keys()].filter((s) => !STATUS_ORDER.includes(s))];
  const out: { status: string; label: string; count: number }[] = [];
  for (const status of order) {
    const m = byStatus.get(status);
    if (!m) continue;
    for (const [label, count] of [...m.entries()].sort((a, b) => b[1] - a[1])) {
      out.push({ status, label, count });
    }
  }
  return out;
}

function monthlyCountsOf(requirements: ConsultantReport['requirements']) {
  const map = new Map<string, number>();
  for (const r of requirements) {
    const m = r.reqDate.slice(0, 7);
    map.set(m, (map.get(m) ?? 0) + 1);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function ChartsRow({ report }: { report: ConsultantReport }) {
  const mix = useMemo(() => statusReasonMixOf(report.requirements), [report.requirements]);
  const byMonth = useMemo(() => monthlyCountsOf(report.requirements), [report.requirements]);
  const max = Math.max(1, ...report.funnel.map((f) => f.target));

  return (
    <div className="grid g-3" style={{ marginBottom: 16 }}>
      <div className="chart-card tint-green">
        <div className="chart-head">
          <span className="ci" style={{ background: '#D9F0E3' }}>
            ✓
          </span>
          <h3>Funnel — achieved vs KPI target</h3>
        </div>
        <div className="funnel" style={{ marginTop: 8 }}>
          {report.funnel.map((f) => (
            <div className="fn-row" key={f.code}>
              <div className="fn-side">
                <b>{f.code}</b>
                {f.label}
              </div>
              <div className="fn-val">{f.actual}</div>
              <div className="fn-track">
                <div className="fn-ghost" style={{ width: '100%' }} />
                <div
                  className="fn-bar"
                  style={{ width: `${Math.min(100, (f.actual / max) * 100)}%` }}
                />
              </div>
              <div className="fn-pct">{f.target}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="chart-card">
        <div className="chart-head">
          <span className="ci" style={{ background: '#EBEEFE' }}>
            ◑
          </span>
          <h3>Requirement status mix</h3>
        </div>
        <div className="chart-box sm">
          <DonutChart labels={mix.map((m) => m.label)} values={mix.map((m) => m.count)} />
        </div>
      </div>
      <div className="chart-card">
        <div className="chart-head">
          <span className="ci" style={{ background: '#F3EAD0' }}>
            ▦
          </span>
          <h3>Requirements by month</h3>
        </div>
        <div className="chart-box sm">
          <VBarChart
            labels={byMonth.map(([m]) => formatMonth(m))}
            values={byMonth.map(([, v]) => v)}
          />
        </div>
      </div>
    </div>
  );
}

function RequirementsTable({ report }: { report: ConsultantReport }) {
  return (
    <Card pad={false}>
      <div style={{ padding: '16px 20px 0' }}>
        <SectionTitle>Requirements ({report.requirements.length})</SectionTitle>
      </div>
      <div className="tbl-wrap">
        <table className="tbl hover">
          <thead>
            <tr>
              <th>Requirement (JD ID &amp; title)</th>
              <th>Type</th>
              <th>JD link</th>
              <th>Positions</th>
              <th>Date</th>
              <th>R0 Profiles</th>
              <th>R1 Shortlist</th>
              <th>R2 L1</th>
              <th>R3 L2</th>
              <th>R4 L3</th>
              <th>R5 Onboard</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {report.requirements.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="mono" style={{ fontWeight: 700 }}>
                    {r.jdId ?? r.code}
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 2 }}>{r.title}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                    {r.client}
                  </div>
                </td>
                <td>{r.type ? <Pill>{r.type}</Pill> : <span className="muted">—</span>}</td>
                <td>
                  {r.jdLink ? (
                    <a className="lnk" href={r.jdLink} target="_blank" rel="noreferrer">
                      JD ↗
                    </a>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="mono">1</td>
                <td className="muted">{formatDate(r.reqDate)}</td>
                <td className="mono">{r.profiles}</td>
                <td className="mono">{r.shortlist}</td>
                <td className="mono">{r.l1}</td>
                <td className="mono">{r.l2}</td>
                <td className="mono">{r.l3}</td>
                <td className="mono">{r.onboard}</td>
                <td>
                  <Pill>{r.status}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function ConsultantDetailPage() {
  const { consultantId } = useParams();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodParams>({});
  const { data: report, isLoading } = useConsultantReport(consultantId ?? null, period);

  const set = (patch: Partial<PeriodParams>) => setPeriod({ ...period, ...patch });

  return (
    <AppShell
      title={report?.consultant.name ?? 'Team member'}
      subtitle={report ? `${report.consultant.role} · ${report.consultant.pod}` : undefined}
    >
      <button type="button" className="lnk" onClick={() => navigate('/team')}>
        ← Back to team
      </button>

      <div className="card pad" style={{ marginTop: 12, marginBottom: 16 }}>
        <div className="filterbar">
          <div className="field">
            <label htmlFor="cd-month">Month</label>
            <input
              id="cd-month"
              type="month"
              value={period.month ?? ''}
              onChange={(e) =>
                set({ month: e.target.value || undefined, from: undefined, to: undefined })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="cd-from">From</label>
            <input
              id="cd-from"
              type="date"
              value={period.from ?? ''}
              onChange={(e) => set({ from: e.target.value || undefined, month: undefined })}
            />
          </div>
          <div className="field">
            <label htmlFor="cd-to">To</label>
            <input
              id="cd-to"
              type="date"
              value={period.to ?? ''}
              onChange={(e) => set({ to: e.target.value || undefined, month: undefined })}
            />
          </div>
          <button type="button" className="btn btn-gho" onClick={() => setPeriod({})}>
            Reset
          </button>
        </div>
      </div>

      {isLoading || !report ? (
        <Card>Loading…</Card>
      ) : (
        <>
          <ConfidenceBanner report={report} />
          <KpiTilesRow report={report} />
          <PriorityTiles report={report} />
          <div style={{ marginBottom: 16 }}>
            <AgingCard report={report} />
          </div>
          <ChartsRow report={report} />
          <RequirementsTable report={report} />
        </>
      )}
    </AppShell>
  );
}
