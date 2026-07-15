import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { KpiCard, Card, SectionTitle, Pill, Empty, ScopeNote } from '../components/ui';
import { HBarChart, DonutChart } from '../components/charts';
import { FilterBar, type FilterState } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../lib/auth';
import {
  useConsultants,
  useOverview,
  useConsultantReport,
  useRequirement,
  useInterviewMonth,
} from '../lib/hooks';
import { usePagination } from '../lib/pagination';
import type { ConsultantReport } from '../lib/types';
import { formatMonth } from '../lib/format';

function period(state: FilterState) {
  return { from: state.from, to: state.to, month: state.month, fy: state.fy };
}

/** Current calendar month as YYYY-MM. */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function InterviewsThisMonth({ state }: { state: FilterState }) {
  const navigate = useNavigate();
  const month = state.month ?? currentMonth();
  const { data } = useInterviewMonth(
    month,
    state.consultantId ? { consultantId: state.consultantId } : {},
  );

  function open() {
    navigate(`/interviews?view=month&month=${month}`);
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <Card className="chart-card tint-blue">
        <div
          role="button"
          tabIndex={0}
          onClick={open}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') open();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            cursor: 'pointer',
          }}
        >
          <div>
            <SectionTitle>Interviews this month</SectionTitle>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              {formatMonth(month)} · click to open the month&apos;s interview calendar
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              className="mono"
              style={{ fontSize: 34, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}
            >
              {data?.total ?? 0}
            </div>
            <span className="muted" style={{ fontSize: 20 }}>
              ›
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function OverviewView({ state }: { state: FilterState }) {
  const { me } = useAuth();
  const { data, isLoading } = useOverview(period(state));
  if (isLoading || !data) return <Card>Loading overview…</Card>;
  const t = data.tiles;
  const c = data.charts;
  return (
    <>
      {me?.scope !== 'org' && (
        <ScopeNote>
          You are viewing your pod ({t.consultants} member{t.consultants === 1 ? '' : 's'}).
        </ScopeNote>
      )}
      <InterviewsThisMonth state={state} />
      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <KpiCard
          tone="blue"
          icon="▤"
          label="Requirements Received"
          value={t.requirementsReceived}
          sub="this period"
        />
        <KpiCard
          tone="sky"
          icon="✓"
          label="Total Closures"
          value={t.totalClosures}
          sub={`${t.closureSplit.radc} RADC · ${t.closureSplit.radf} RADF`}
        />
        <KpiCard
          tone="sand"
          icon="▦"
          label="Total Requirements"
          value={t.totalRequirements}
          sub="handled in period"
        />
        <KpiCard
          tone="gold"
          icon="✎"
          label="Insights Published"
          value={t.insightsPublished}
          sub="team total"
        />
      </div>
      <div className="grid g-3" style={{ marginBottom: 20 }}>
        <KpiCard
          tone="green"
          icon="◆"
          label="Events Hosted"
          value={t.eventsHosted}
          sub="team total"
        />
        <KpiCard
          tone="violet"
          icon="◇"
          label="Events Participated"
          value={t.eventsParticipated}
          sub="team total"
        />
        <KpiCard tone="teal" icon="◎" label="Consultants" value={t.consultants} sub="in scope" />
      </div>
      <div className="grid g-58" style={{ marginBottom: 16 }}>
        <div className="chart-card tint-blue">
          <div className="chart-head">
            <span className="ci" style={{ background: 'var(--primary-l)' }}>
              ▤
            </span>
            <h3>Requirements by consultant</h3>
          </div>
          <div className="chart-box">
            <HBarChart
              labels={c.requirementsByConsultant.map((x) => x.name)}
              values={c.requirementsByConsultant.map((x) => x.value)}
            />
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-head">
            <span className="ci" style={{ background: '#EBEEFE' }}>
              ◑
            </span>
            <h3>Status mix</h3>
          </div>
          <div className="chart-box">
            <DonutChart
              labels={['Active', 'On Hold', 'Closed']}
              values={[c.statusMix.active, c.statusMix.onHold, c.statusMix.closed]}
            />
          </div>
        </div>
      </div>
      <div className="grid g-2">
        <div className="chart-card tint-green">
          <div className="chart-head">
            <span className="ci" style={{ background: '#D9F0E3' }}>
              ✓
            </span>
            <h3>Closures by consultant</h3>
          </div>
          <div className="chart-box sm">
            <HBarChart
              labels={c.closuresByConsultant.map((x) => x.name)}
              values={c.closuresByConsultant.map((x) => x.value)}
            />
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-head">
            <span className="ci" style={{ background: '#F1EBFE' }}>
              ◈
            </span>
            <h3>Confidence by consultant</h3>
          </div>
          <div className="chart-box sm">
            <HBarChart
              labels={c.confidenceByConsultant.map((x) => x.name)}
              values={c.confidenceByConsultant.map((x) => x.value)}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function Gauge({ report }: { report: ConsultantReport }) {
  const { score, band } = report.confidence;
  return (
    <div className="gauge-wrap">
      <div className="gauge">
        <div className="mono" style={{ fontSize: 48, fontWeight: 800, color: 'var(--primary)' }}>
          {score}
        </div>
        <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
          {band}
        </div>
        <div className="pill p-blue" style={{ marginTop: 8 }}>
          KPI {report.kpi.val}/4 · {report.kpi.label}
        </div>
      </div>
      <div className="factors">
        {report.confidence.factors.map(([label, val]) => (
          <div className="factor" key={label}>
            <div
              className="ring mono"
              style={{
                display: 'grid',
                placeItems: 'center',
                borderRadius: '50%',
                border: '4px solid var(--primary-l)',
                color: 'var(--primary)',
                fontWeight: 700,
              }}
            >
              {val}
            </div>
            <div className="fl">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Funnel({ report }: { report: ConsultantReport }) {
  const max = Math.max(1, ...report.funnel.map((f) => f.target));
  return (
    <div className="funnel">
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
  );
}

function ConsultantView({
  consultantId,
  state,
  onOpenReq,
}: {
  consultantId: string;
  state: FilterState;
  onOpenReq: (id: string) => void;
}) {
  const { data: report, isLoading } = useConsultantReport(consultantId, period(state));
  const { page, setPage, pageCount, pageItems, pageSize, totalItems } = usePagination(
    report?.requirements ?? [],
  );
  if (isLoading || !report) return <Card>Loading report…</Card>;
  return (
    <>
      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <Card>
          <SectionTitle>Confidence &amp; KPI</SectionTitle>
          <div style={{ marginTop: 14 }}>
            <Gauge report={report} />
          </div>
        </Card>
        <Card>
          <SectionTitle color="var(--green)">Pipeline funnel</SectionTitle>
          <div style={{ marginTop: 14 }}>
            <Funnel report={report} />
          </div>
        </Card>
      </div>
      <Card pad={false}>
        <div style={{ padding: '16px 20px 0' }}>
          <SectionTitle>Requirements ({report.requirements.length})</SectionTitle>
        </div>
        {report.requirements.length === 0 ? (
          <Empty title="No requirements in this period" icon="▦">
            Try widening the date range or picking a different month.
          </Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl hover">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Title</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Profiles</th>
                  <th>Onboard</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r) => (
                  <tr key={r.id} onClick={() => onOpenReq(r.id)}>
                    <td className="mono">{r.code}</td>
                    <td>{r.title}</td>
                    <td>{r.client}</td>
                    <td>
                      <Pill>{r.status}</Pill>
                    </td>
                    <td className="mono">{r.profiles}</td>
                    <td className="mono">{r.onboard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalItems={totalItems}
          onChange={setPage}
        />
      </Card>
    </>
  );
}

export default function HomePage() {
  const { data: consultants = [] } = useConsultants();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<FilterState>({
    consultantId: params.get('consultant') ?? '',
  });
  const [openReq, setOpenReq] = useState<string | null>(null);

  function updateState(next: FilterState) {
    setState(next);
    const p = new URLSearchParams();
    if (next.consultantId) p.set('consultant', next.consultantId);
    setParams(p, { replace: true });
  }

  return (
    <AppShell title="Home" subtitle="Team overview & per-consultant report">
      <FilterBar state={state} onChange={updateState} consultants={consultants} />
      {state.consultantId ? (
        <ConsultantView consultantId={state.consultantId} state={state} onOpenReq={setOpenReq} />
      ) : (
        <OverviewView state={state} />
      )}
      {openReq && <RequirementModal id={openReq} onClose={() => setOpenReq(null)} />}
    </AppShell>
  );
}

function RequirementModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useRequirement(id);
  return (
    <div
      role="dialog"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,.5)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 60,
        padding: 20,
      }}
    >
      <div
        className="card pad"
        style={{ width: 520, maxWidth: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle>Requirement detail</SectionTitle>
        {!data ? (
          <p className="muted">Loading…</p>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div className="mono" style={{ fontWeight: 700 }}>
              {(data as Record<string, string>).code}
            </div>
            <h3 style={{ margin: '4px 0' }}>{(data as Record<string, string>).title}</h3>
            <p className="muted">{(data as Record<string, string>).client}</p>
          </div>
        )}
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button className="btn btn-gho" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
