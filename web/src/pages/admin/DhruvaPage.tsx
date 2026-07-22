import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { Card, SectionTitle, Empty, KpiCard } from '../../components/ui';
import { useClients, useConsultants, useDhruva, type DhruvaFilterParams } from '../../lib/hooks';
import { currentMonth, recentFiscalYears, fyLabel } from '../../lib/fy';
import { TeamRosterTable } from '../MyTeamPage';

const PRIORITY_OPTIONS = ['P1', 'P2', 'P3', 'NA'];
function priorityLabel(p: string): string {
  return p === 'NA' ? 'Uncategorised' : p;
}

/** Only the period fields — priority/client/ppg live in the funnel's own filter row. */
function defaultPeriodFilters(): DhruvaFilterParams {
  return { month: currentMonth() };
}

function RapydTiles({
  data,
}: {
  data: {
    rapyd: { total: number; radc: number; radf: number };
    activeClients: number;
    interviewsToday: { total: number; radc: number; radf: number };
  };
}) {
  const navigate = useNavigate();
  const goToType = (type: string) => () => navigate(`/hdis?type=${type}&status=Active`);
  return (
    <div className="grid g-3" style={{ marginBottom: 16 }}>
      <div className="skc">
        <div className="skc-head">
          <span className="dot" />● RAPYD Active
        </div>
        <div className="skc-num">{data.rapyd.total}</div>
        <div className="skc-sub">live contract + full-time positions</div>
        <div className="skc-split">
          <SplitItem
            onClick={goToType('RADC')}
            value={data.rapyd.radc}
            label="RADC"
            color="var(--violet)"
          />
          <SplitItem
            onClick={goToType('RADF')}
            value={data.rapyd.radf}
            label="RADF"
            color="var(--sky)"
          />
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

/** A clickable RADC/RADF (or similar) split-tile number — keeps the existing
 * .skc-split-item flex/border-left CSS by staying a direct flex child, just with
 * click/keyboard handlers layered on. Jumps into the HDIS list pre-filtered by type. */
function SplitItem({
  onClick,
  value,
  label,
  color,
}: {
  onClick: () => void;
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div
      className="skc-split-item"
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
      <div className="skc-split-val" style={{ color }}>
        {value}
      </div>
      <div className="skc-split-cap">{label}</div>
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
  // Only the funnel-specific filters (priority/client/PPG) count here — the period
  // (month/FY/custom range) has its own reset in the page-level PeriodFilterBar above.
  const hasFunnelFilters = !!(filters.priority || filters.client || filters.ppg);

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
        <button
          type="button"
          className="btn btn-gho"
          disabled={!hasFunnelFilters}
          onClick={() => onChange({ priority: undefined, client: undefined, ppg: undefined })}
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

/** Page-level period control — Month / FY / custom From-To, defaulting to the current
 * month. Drives the funnel below (FunnelCard runs its own filtered query off `filters`);
 * the headline tiles intentionally stay unscoped (always the whole live dataset). */
function PeriodFilterBar({
  filters,
  onChange,
}: {
  filters: DhruvaFilterParams;
  onChange: (patch: Partial<DhruvaFilterParams>) => void;
}) {
  const fys = useMemo(() => recentFiscalYears(), []);
  const isDefault = filters.month === currentMonth() && !filters.fy && !filters.from && !filters.to;
  return (
    <div className="card pad" style={{ marginBottom: 16 }}>
      <div className="filterbar">
        <div className="field">
          <label htmlFor="dh-fy">FY</label>
          <select
            id="dh-fy"
            value={filters.fy ?? ''}
            onChange={(e) => onChange({ fy: e.target.value || undefined })}
          >
            <option value="">All</option>
            {fys.map((fy) => (
              <option key={fy} value={fy}>
                {fyLabel(fy)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dh-month">Month</label>
          <input
            id="dh-month"
            type="month"
            value={filters.month ?? ''}
            onChange={(e) =>
              onChange({ month: e.target.value || undefined, from: undefined, to: undefined })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="dh-pf-from">From</label>
          <input
            id="dh-pf-from"
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => onChange({ from: e.target.value || undefined, month: undefined })}
          />
        </div>
        <div className="field">
          <label htmlFor="dh-pf-to">To</label>
          <input
            id="dh-pf-to"
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => onChange({ to: e.target.value || undefined, month: undefined })}
          />
        </div>
        <button
          type="button"
          className="btn btn-gho"
          disabled={isDefault}
          onClick={() =>
            onChange({ month: currentMonth(), fy: undefined, from: undefined, to: undefined })
          }
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default function DhruvaPage() {
  // Priority/Client/PPG (funnel-only) plus the period (Month/FY/custom range) that
  // now drives the funnel — defaults to the current month instead of opening unscoped.
  const [filters, setFilters] = useState<DhruvaFilterParams>(defaultPeriodFilters);
  // Headline tiles always reflect the whole live dataset — fetched once, unaffected by
  // the period/funnel filters below (FunnelCard runs its own filtered query).
  const { data, isLoading } = useDhruva({});
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
      <PeriodFilterBar filters={filters} onChange={patchFilters} />
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
          <div style={{ marginTop: 16 }}>
            <TeamRosterTable />
          </div>
        </>
      )}
    </AppShell>
  );
}
