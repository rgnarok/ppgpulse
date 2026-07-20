import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { Card, SectionTitle, Empty, KpiCard } from '../../components/ui';
import { useClients, useConsultants, useDhruva, type DhruvaFilterParams } from '../../lib/hooks';
import type { DhruvaTopClient } from '../../lib/types';
import { TeamRosterTable } from '../MyTeamPage';

const PRIORITY_OPTIONS = ['P1', 'P2', 'P3', 'NA'];
function priorityLabel(p: string): string {
  return p === 'NA' ? 'Uncategorised' : p;
}

const EMPTY_FILTERS: DhruvaFilterParams = {};

function RapydTiles({
  data,
}: {
  data: {
    rapyd: { total: number; radc: number; radf: number };
    activeClients: number;
    interviewsToday: { total: number; radc: number; radf: number };
  };
}) {
  return (
    <div className="grid g-3" style={{ marginBottom: 16 }}>
      <div className="skc">
        <div className="skc-head">
          <span className="dot" />● RAPYD Active
        </div>
        <div className="skc-num">{data.rapyd.total}</div>
        <div className="skc-sub">live contract + full-time positions</div>
        <div className="skc-split">
          <div className="skc-split-item">
            <div className="skc-split-val" style={{ color: 'var(--violet)' }}>
              {data.rapyd.radc}
            </div>
            <div className="skc-split-cap">RADC</div>
          </div>
          <div className="skc-split-item">
            <div className="skc-split-val" style={{ color: 'var(--sky)' }}>
              {data.rapyd.radf}
            </div>
            <div className="skc-split-cap">RADF</div>
          </div>
        </div>
      </div>
      <div className="skc">
        <div className="skc-head">
          <span className="dot" />○ Active Clients
        </div>
        <div className="skc-num">{data.activeClients}</div>
        <div className="skc-sub">clients with live requirements</div>
      </div>
      <div className="skc">
        <div className="skc-head">
          <span className="dot" />◷ Interviews — Today
        </div>
        <div className="skc-num">{data.interviewsToday.total}</div>
        <div className="skc-sub">across live requirements</div>
        <div className="skc-split">
          <div className="skc-split-item">
            <div className="skc-split-val" style={{ color: 'var(--violet)' }}>
              {data.interviewsToday.radc}
            </div>
            <div className="skc-split-cap">RADC</div>
          </div>
          <div className="skc-split-item">
            <div className="skc-split-val" style={{ color: 'var(--sky)' }}>
              {data.interviewsToday.radf}
            </div>
            <div className="skc-split-cap">RADF</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Wraps a KpiCard so the whole tile is a keyboard-accessible click target — used to
 * jump into the HDIS list pre-filtered to that priority. */
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

function PriorityTiles({
  priority,
}: {
  priority: { p1: number; p2: number; p3: number; uncategorised: number };
}) {
  const navigate = useNavigate();
  const total = priority.p1 + priority.p2 + priority.p3 + priority.uncategorised || 1;
  const pct = (n: number) => `${Math.round((n / total) * 100)}% of live`;
  // Only Active (not On Hold) — these tiles are meant as a "what needs attention right
  // now" jump-off point, and an On Hold requirement isn't actionable today.
  const goTo = (p: string) => () => navigate(`/hdis?priority=${p}&status=Active`);
  return (
    <div className="grid g-4" style={{ marginBottom: 16 }}>
      <ClickableTile onClick={goTo('P1')}>
        <KpiCard
          tone="sand"
          icon="●"
          label="P1 — Live"
          value={priority.p1}
          sub={pct(priority.p1)}
        />
      </ClickableTile>
      <ClickableTile onClick={goTo('P2')}>
        <KpiCard
          tone="gold"
          icon="●"
          label="P2 — Live"
          value={priority.p2}
          sub={pct(priority.p2)}
        />
      </ClickableTile>
      <ClickableTile onClick={goTo('P3')}>
        <KpiCard tone="sky" icon="●" label="P3 — Live" value={priority.p3} sub={pct(priority.p3)} />
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

function conversionTone(dropoffPct: number | null): string {
  if (dropoffPct === null) return 'var(--green)';
  const kept = 100 - dropoffPct;
  if (kept >= 66) return 'var(--green)';
  if (kept >= 40) return 'var(--amber)';
  return 'var(--red)';
}

function FunnelCard({
  filters,
  onChange,
  clients,
  ppgNames,
}: {
  filters: DhruvaFilterParams;
  onChange: (patch: Partial<DhruvaFilterParams>) => void;
  clients: string[];
  ppgNames: string[];
}) {
  const { data, isLoading } = useDhruva(filters);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <SectionTitle color="var(--green)">Recruitment Lifecycle Funnel · R0 → R5</SectionTitle>
      </div>
      <div className="filterbar filterbar-compact" style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="dh-priority">Priority</label>
          <select
            id="dh-priority"
            value={filters.priority ?? ''}
            onChange={(e) => onChange({ priority: e.target.value || undefined })}
          >
            <option value="">All</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dh-client">Client</label>
          <select
            id="dh-client"
            value={filters.client ?? ''}
            onChange={(e) => onChange({ client: e.target.value || undefined })}
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dh-ppg">PPG</label>
          <select
            id="dh-ppg"
            value={filters.ppg ?? ''}
            onChange={(e) => onChange({ ppg: e.target.value || undefined })}
          >
            <option value="">All</option>
            {ppgNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dh-from">From</label>
          <input
            id="dh-from"
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => onChange({ from: e.target.value || undefined })}
          />
        </div>
        <div className="field">
          <label htmlFor="dh-to">To</label>
          <input
            id="dh-to"
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => onChange({ to: e.target.value || undefined })}
          />
        </div>
        <button
          type="button"
          className="btn btn-gho"
          disabled={!hasFilters}
          onClick={() =>
            onChange({
              priority: undefined,
              client: undefined,
              ppg: undefined,
              from: undefined,
              to: undefined,
            })
          }
        >
          Reset
        </button>
      </div>

      {isLoading || !data ? (
        <div className="empty">Loading…</div>
      ) : (
        <div className="funnel" style={{ marginTop: 16 }}>
          {data.funnel.map((f, i) => {
            const max = Math.max(1, data.funnel[0].count);
            const kept = f.dropoffPct === null ? 100 : 100 - f.dropoffPct;
            return (
              <div className="fn-row" key={f.code}>
                <div className="fn-side">
                  <b>{f.code}</b>
                  {f.label}
                </div>
                <div className="fn-val">{f.count}</div>
                <div className="fn-track">
                  <div className="fn-ghost" style={{ width: '100%' }} />
                  <div
                    className="fn-bar"
                    style={{
                      width: `${Math.min(100, (f.count / max) * 100)}%`,
                      background: conversionTone(f.dropoffPct),
                    }}
                  />
                </div>
                <div className="fn-pct" style={{ color: conversionTone(f.dropoffPct) }}>
                  {i === 0 ? '—' : `${kept}%`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function TopClientsList({ title, items }: { title: string; items: DhruvaTopClient[] }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
        {title}
      </div>
      {items.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No deployments yet.
        </p>
      ) : (
        items.map((c, i) => (
          <div
            key={c.client}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: i < items.length - 1 ? '1px solid var(--border)' : undefined,
            }}
          >
            <span>
              <span className="mono muted" style={{ marginRight: 8 }}>
                {i + 1}
              </span>
              {c.client}
            </span>
            <span className="mono" style={{ fontWeight: 700 }}>
              {c.deployed}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

export default function DhruvaPage() {
  const [filters, setFilters] = useState<DhruvaFilterParams>(EMPTY_FILTERS);
  // Headline tiles always reflect the whole live dataset — fetched once, unaffected by
  // the funnel filters below (FunnelCard runs its own filtered query).
  const { data, isLoading } = useDhruva(EMPTY_FILTERS);
  const { data: clientRows = [] } = useClients();
  const { data: consultants = [] } = useConsultants();
  const clientNames = useMemo(() => clientRows.map((c) => c.name), [clientRows]);
  const ppgNames = useMemo(
    () => [...new Set(consultants.map((c) => c.name))].sort((a, b) => a.localeCompare(b)),
    [consultants],
  );

  function patchFilters(patch: Partial<DhruvaFilterParams>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  return (
    <AppShell title="Dhruva" subtitle="Org-wide operations dashboard — RAPYD, funnel & team">
      {isLoading || !data ? (
        <Card>Loading…</Card>
      ) : data.rapyd.total === 0 && data.activeClients === 0 ? (
        <Empty title="No live HDIS records yet" icon="◈">
          Once requirements are added and pipeline activity is logged, this dashboard fills in.
        </Empty>
      ) : (
        <>
          <RapydTiles data={data} />
          <PriorityTiles priority={data.priority} />
          <div style={{ marginBottom: 16 }}>
            <FunnelCard
              filters={filters}
              onChange={patchFilters}
              clients={clientNames}
              ppgNames={ppgNames}
            />
          </div>
          <Card>
            <SectionTitle color="var(--gold)">Top Clients · RADC &amp; RADF</SectionTitle>
            <p className="muted" style={{ fontSize: 12, margin: '2px 0 12px' }}>
              Top 5 clients per motion, ranked by people deployed.
            </p>
            <div className="grid g-2">
              <TopClientsList title="RADC" items={data.topClients.radc} />
              <TopClientsList title="RADF" items={data.topClients.radf} />
            </div>
          </Card>
          <div style={{ marginTop: 16 }}>
            <TeamRosterTable />
          </div>
        </>
      )}
    </AppShell>
  );
}
