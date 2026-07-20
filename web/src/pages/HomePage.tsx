import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { KpiCard, Card, SectionTitle, ScopeNote } from '../components/ui';
import { HBarChart, DonutChart } from '../components/charts';
import { FilterBar, type FilterState } from '../components/FilterBar';
import { useAuth } from '../lib/auth';
import { useConsultants, useOverview, useInterviewMonth } from '../lib/hooks';
import { formatMonth } from '../lib/format';
import { currentFy } from '../lib/fy';
import type { ScopedConsultant } from '../lib/types';

/** Everything the Overview endpoint takes, including the optional single-consultant
 * narrowing — selecting someone in the Consultant filter re-scopes this same set of
 * tiles/charts to just them, it never swaps in a different page layout. */
function period(state: FilterState) {
  return {
    from: state.from,
    to: state.to,
    month: state.month,
    fy: state.fy,
    consultantId: state.consultantId || undefined,
  };
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

function OverviewView({
  state,
  consultants,
}: {
  state: FilterState;
  consultants: ScopedConsultant[];
}) {
  const { me } = useAuth();
  const { data, isLoading } = useOverview(period(state));
  if (isLoading || !data) return <Card>Loading overview…</Card>;
  const t = data.tiles;
  const c = data.charts;
  const selected = state.consultantId
    ? consultants.find((x) => x.id === state.consultantId)
    : undefined;
  return (
    <>
      {selected ? (
        <ScopeNote>
          Showing {selected.name}&apos;s data only — pick &quot;— Team overview —&quot; above to see
          everyone.
        </ScopeNote>
      ) : (
        me?.scope !== 'org' && (
          <ScopeNote>
            You are viewing your pod ({t.consultants} member{t.consultants === 1 ? '' : 's'}).
          </ScopeNote>
        )
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
          sub={selected ? 'lifetime total' : 'team total'}
        />
      </div>
      <div className="grid g-3" style={{ marginBottom: 20 }}>
        <KpiCard
          tone="green"
          icon="◆"
          label="Events Hosted"
          value={t.eventsHosted}
          sub={selected ? 'lifetime total' : 'team total'}
        />
        <KpiCard
          tone="violet"
          icon="◇"
          label="Events Participated"
          value={t.eventsParticipated}
          sub={selected ? 'lifetime total' : 'team total'}
        />
        <KpiCard tone="teal" icon="◎" label="PPG" value={t.consultants} sub="in scope" />
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

export default function HomePage() {
  const { data: consultants = [] } = useConsultants();
  const [params, setParams] = useSearchParams();
  // Defaults to the fiscal year currently in progress — matches the "keep the latest
  // fiscal year active" expectation instead of opening on a stale historical window.
  const [state, setState] = useState<FilterState>({
    consultantId: params.get('consultant') ?? '',
    fy: params.get('fy') ?? currentFy(),
  });

  function updateState(next: FilterState) {
    setState(next);
    const p = new URLSearchParams();
    if (next.consultantId) p.set('consultant', next.consultantId);
    if (next.fy) p.set('fy', next.fy);
    setParams(p, { replace: true });
  }

  return (
    <AppShell title="Home" subtitle="Team overview & per-consultant report">
      <FilterBar state={state} onChange={updateState} consultants={consultants} />
      <OverviewView state={state} consultants={consultants} />
    </AppShell>
  );
}
