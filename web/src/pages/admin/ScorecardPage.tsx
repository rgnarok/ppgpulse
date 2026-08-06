import { useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Card, SectionTitle, Empty, Pill } from '../../components/ui';
import { useScorecard, type PeriodParams } from '../../lib/hooks';
import { currentMonth, recentFiscalYears, fyLabel } from '../../lib/fy';
import type { ScorecardDashboard, ScorecardHighlight, ScorecardRow } from '../../lib/types';

function defaultFilters(): PeriodParams {
  return { month: currentMonth() };
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Page-level period control — Month / FY / custom From-To, defaulting to the
 * current month. Mirrors Dhruva's PeriodFilterBar (same UX, separate component
 * since neither page exports its filter bar for reuse). */
function PeriodFilterBar({
  filters,
  onChange,
}: {
  filters: PeriodParams;
  onChange: (patch: Partial<PeriodParams>) => void;
}) {
  const fys = useMemo(() => recentFiscalYears(), []);
  const isDefault = filters.month === currentMonth() && !filters.fy && !filters.from && !filters.to;
  return (
    <div className="card pad" style={{ marginBottom: 16 }}>
      <div className="filterbar">
        <div className="field">
          <label htmlFor="sc-fy">FY</label>
          <select
            id="sc-fy"
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
          <label htmlFor="sc-month">Month</label>
          <input
            id="sc-month"
            type="month"
            value={filters.month ?? ''}
            onChange={(e) =>
              onChange({ month: e.target.value || undefined, from: undefined, to: undefined })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="sc-from">From</label>
          <input
            id="sc-from"
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => onChange({ from: e.target.value || undefined, month: undefined })}
          />
        </div>
        <div className="field">
          <label htmlFor="sc-to">To</label>
          <input
            id="sc-to"
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

/** One "top performer" tile — a recruiter name plus the metric value that earned
 * them the spot. Renders an empty state when nobody in the period qualifies (e.g. no
 * candidate has an offer yet). */
function HighlightTile({
  icon,
  label,
  highlight,
  format,
  sub,
  tone,
}: {
  icon: string;
  label: string;
  highlight: ScorecardHighlight | null;
  format: (value: number) => string;
  sub?: (highlight: ScorecardHighlight) => string;
  tone?: string;
}) {
  return (
    <div className="skc">
      <div className="skc-head">
        <span className="dot" style={tone ? { background: tone } : undefined} />
        <span>{icon}</span> <span>{label}</span>
      </div>
      {highlight ? (
        <>
          <div className="skc-num" style={{ fontSize: 20, marginTop: 10 }}>
            {highlight.ownerName}
          </div>
          <div className="skc-sub" style={{ marginTop: 4 }}>
            {format(highlight.value)}
            {sub ? ` · ${sub(highlight)}` : ''}
          </div>
        </>
      ) : (
        <div className="skc-sub" style={{ marginTop: 10 }}>
          No data yet this period
        </div>
      )}
    </div>
  );
}

function HighlightTiles({ data }: { data: ScorecardDashboard }) {
  const rowFor = (ownerName: string) => data.ranking.find((r) => r.ownerName === ownerName);
  return (
    <div className="grid g-4" style={{ marginBottom: 16 }}>
      <HighlightTile
        icon="◉"
        label="Max Closures, Min Profiles"
        highlight={data.highlights.closureEfficiency}
        format={(v) => `${pct(v)} closure rate`}
        sub={(h) => {
          const r = rowFor(h.ownerName);
          return r ? `${r.closures} closures / ${r.profilesSubmitted} profiles` : '';
        }}
      />
      <HighlightTile
        icon="▲"
        label="Most L2 Conversions"
        highlight={data.highlights.l2Conversions}
        format={(v) => `${v} profiles reached L2`}
      />
      <HighlightTile
        icon="▲"
        label="Most L3 Conversions"
        highlight={data.highlights.l3Conversions}
        format={(v) => `${v} profiles reached L3`}
      />
      <HighlightTile
        icon="◷"
        label="Lowest Turnaround Time"
        highlight={data.highlights.lowestTat}
        format={(v) => `${v} days avg. TAT`}
      />
      <HighlightTile
        icon="○"
        label="Lowest Dropout Rate"
        highlight={data.highlights.lowestDropoutRate}
        format={pct}
        tone="var(--green)"
      />
      <HighlightTile
        icon="!"
        label="Highest Dropout Rate"
        highlight={data.highlights.highestDropoutRate}
        format={pct}
        sub={() => 'may need support'}
        tone="var(--red)"
      />
      <HighlightTile
        icon="→"
        label="Best Interview → Offer"
        highlight={data.highlights.interviewToOfferRatio}
        format={pct}
      />
      <HighlightTile
        icon="→"
        label="Best Offer → Joining"
        highlight={data.highlights.offerToJoinRatio}
        format={pct}
      />
    </div>
  );
}

function TechStackExpertise({ data }: { data: ScorecardDashboard }) {
  if (data.techStackExpertise.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <Card pad={false}>
        <div style={{ padding: '16px 20px 0' }}>
          <SectionTitle color="var(--violet)">Expertise by Tech Stack</SectionTitle>
          <div className="skc-sub" style={{ marginTop: 2 }}>
            who&apos;s onboarded the most profiles against each stack this period
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Tech Stack</th>
                <th>Top Recruiter</th>
                <th>Closures (top)</th>
                <th>Total Closures</th>
              </tr>
            </thead>
            <tbody>
              {data.techStackExpertise.map((t) => (
                <tr key={t.techStack}>
                  <td style={{ fontWeight: 600 }}>{t.techStack}</td>
                  <td>{t.topOwnerName}</td>
                  <td className="mono">{t.closures}</td>
                  <td className="mono muted">{t.totalClosures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const RANK_TONE = ['p-gold', 'p-blue', 'p-blue'];

function RankingTable({ ranking }: { ranking: ScorecardRow[] }) {
  if (ranking.length === 0) return <Empty title="No requirements in this period" icon="★" />;
  return (
    <Card pad={false}>
      <div style={{ padding: '16px 20px 0' }}>
        <SectionTitle color="var(--gold)">Overall Monthly Ranking</SectionTitle>
        <div className="skc-sub" style={{ marginTop: 2 }}>
          composite of closure efficiency, L2/L3 conversions, interview→offer, offer→joining,
          dropout rate &amp; TAT — each normalized against this period
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Recruiter</th>
              <th>Profiles</th>
              <th>Closures</th>
              <th>L2</th>
              <th>L3</th>
              <th>Dropout</th>
              <th>Avg TAT</th>
              <th>Int→Offer</th>
              <th>Offer→Join</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r) => (
              <tr key={r.ownerName}>
                <td>
                  {r.rank ? (
                    <Pill tone={RANK_TONE[r.rank - 1] ?? 'p-grey'}>{`#${r.rank}`}</Pill>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td style={{ fontWeight: 600 }}>{r.ownerName}</td>
                <td className="mono">{r.profilesSubmitted}</td>
                <td className="mono">{r.closures}</td>
                <td className="mono">{r.l2Conversions}</td>
                <td className="mono">{r.l3Conversions}</td>
                <td className="mono">{r.dropoutRate != null ? pct(r.dropoutRate) : '—'}</td>
                <td className="mono">{r.avgTatDays != null ? `${r.avgTatDays}d` : '—'}</td>
                <td className="mono">
                  {r.interviewToOfferRatio != null ? pct(r.interviewToOfferRatio) : '—'}
                </td>
                <td className="mono">
                  {r.offerToJoinRatio != null ? pct(r.offerToJoinRatio) : '—'}
                </td>
                <td className="mono" style={{ fontWeight: 700 }}>
                  {r.score != null ? r.score.toFixed(2) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function ScorecardPage() {
  const [filters, setFilters] = useState<PeriodParams>(defaultFilters);
  const { data, isLoading } = useScorecard(filters);

  function patchFilters(patch: Partial<PeriodParams>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  return (
    <AppShell
      title="Performance Scorecard"
      subtitle="Monthly top performers — closures, conversions, TAT & dropout"
    >
      <PeriodFilterBar filters={filters} onChange={patchFilters} />
      {isLoading || !data ? (
        <Card>Loading…</Card>
      ) : data.candidateCount === 0 ? (
        <Empty title="No requirements in this period yet" icon="★">
          Raise HDIS requirements with owners and log Pipeline activity (add a Tech Stack tag too,
          for the expertise breakdown) to start populating the scorecard.
        </Empty>
      ) : (
        <>
          <HighlightTiles data={data} />
          <TechStackExpertise data={data} />
          <RankingTable ranking={data.ranking} />
        </>
      )}
    </AppShell>
  );
}
