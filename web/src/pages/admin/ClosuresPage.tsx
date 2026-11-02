import { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { AppShell } from '../../components/AppShell';
import { Card, SectionTitle, Btn, Empty } from '../../components/ui';
import {
  useClosuresScorecard,
  useCreateClosure,
  useDeleteClosure,
  useImportClosures,
  useSaveClosureTargets,
  type ClosureType,
  type ClosuresScorecard,
  type PerType,
} from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { can } from '../../lib/permissions';
import { useToast } from '../../lib/toast';
import { currentFy, recentFiscalYears, fyLabel } from '../../lib/fy';
import { formatMonth } from '../../lib/format';

ChartJS.register(
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

const TYPES: ClosureType[] = ['RADC', 'RADF', 'Internal'];
const TYPE_LABEL: Record<ClosureType, string> = {
  RADC: 'RAPYD Contract',
  RADF: 'RAPYD FTE',
  Internal: 'Internal',
};
const TYPE_COLOR: Record<ClosureType, string> = {
  RADC: '#4F46E5',
  RADF: '#C99A2E',
  Internal: '#10B981',
};

const monthShort = (m: string) => formatMonth(m).replace(' 20', " '");
const rapyd = (p: PerType) => p.RADC + p.RADF;
const sum = (p: PerType) => p.RADC + p.RADF + p.Internal;
const pct = (v: number) => `${Math.round(v * 100)}%`;

function cellTone(value: number, target: number | null, elapsed: boolean, benchmark: number) {
  if (!elapsed) return undefined;
  if (value === 0) return 'var(--red, #dc2626)';
  if (target && value >= target) return 'var(--green, #16a34a)';
  if (target && value / target >= benchmark) return 'var(--green, #16a34a)';
  return 'var(--amber, #d97706)';
}

export default function ClosuresPage() {
  const { me } = useAuth();
  const [fy, setFy] = useState(currentFy());
  const { data, isLoading } = useClosuresScorecard(fy);
  const canAdd = can(me, 'closures', 'add');
  const canEdit = can(me, 'closures', 'edit');
  const canDelete = can(me, 'closures', 'delete');
  const fys = useMemo(() => recentFiscalYears(), []);

  return (
    <AppShell
      title="Closures Scorecard"
      subtitle="RAPYD Contract + FTE and Internal closures vs targets, by month and recruiter"
    >
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="filterbar">
          <div className="field">
            <label htmlFor="cl-fy">Financial year</label>
            <select id="cl-fy" value={fy} onChange={(e) => setFy(e.target.value)}>
              {fys.map((y) => (
                <option key={y} value={y}>
                  {fyLabel(y)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {isLoading || !data ? (
        <Card>Loading…</Card>
      ) : (
        <>
          <Tiles data={data} />
          <TrendChart data={data} />
          <TypeTable data={data} />
          <RecruiterTable data={data} />
          {canAdd && <AddClosure data={data} />}
          <Entries data={data} canDelete={canDelete} />
          {canEdit && <Targets data={data} />}
        </>
      )}
    </AppShell>
  );
}

function Tiles({ data }: { data: ClosuresScorecard }) {
  const k = data.kpis;
  const focus = data.months.includes(data.currentMonth)
    ? data.currentMonth
    : data.months[data.months.length - 1];
  const cur = data.byType[focus];
  const target = data.teamTargets[focus];
  return (
    <div className="grid g-4" style={{ marginBottom: 16 }}>
      <div className="skc">
        <div className="skc-head">
          <span>RAPYD closures · {formatMonth(focus)}</span>
        </div>
        <div className="skc-num">
          {rapyd(cur)} <span className="muted">/ {target}</span>
        </div>
        <div className="skc-sub">
          {rapyd(cur) === 0 ? 'no closures logged' : `${pct(rapyd(cur) / (target || 1))} of target`}
        </div>
      </div>
      <div className="skc">
        <div className="skc-head">
          <span>Split by type · {formatMonth(focus)}</span>
        </div>
        {TYPES.map((t) => (
          <div
            key={t}
            className="skc-sub"
            style={{ display: 'flex', justifyContent: 'space-between' }}
          >
            <span>{TYPE_LABEL[t]}</span>
            <span className="mono">{cur[t]}</span>
          </div>
        ))}
      </div>
      <div className="skc">
        <div className="skc-head">
          <span>Financial year to date</span>
        </div>
        <div className="skc-num">
          {k.rapyd} <span className="muted">+ {k.internal} internal</span>
        </div>
        <div className="skc-sub">
          RAPYD {k.rapydPctOfTarget === null ? '—' : pct(k.rapydPctOfTarget)} of {k.targetToDate}{' '}
          target to date · {k.all} closures in all
        </div>
      </div>
      <div className="skc">
        <div className="skc-head">
          <span>Months at {pct(data.benchmark)}+</span>
        </div>
        <div className="skc-num">
          {k.monthsAt80} <span className="muted">/ {k.monthsElapsed}</span>
        </div>
        <div className="skc-sub">months elapsed in {fyLabel(data.fy)}</div>
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: ClosuresScorecard }) {
  const labels = data.months.map(monthShort);
  return (
    <Card>
      <SectionTitle color="var(--violet)">Month on month closures</SectionTitle>
      <div style={{ height: 260 }}>
        <Chart
          type="bar"
          data={{
            labels,
            datasets: [
              ...TYPES.map((t) => ({
                type: 'bar' as const,
                label: TYPE_LABEL[t],
                data: data.months.map((m) => data.byType[m][t]),
                backgroundColor: TYPE_COLOR[t],
                stack: 'c',
                borderRadius: 4,
              })),
              {
                type: 'line' as const,
                label: 'Team target',
                data: data.months.map((m) => data.teamTargets[m]),
                borderColor: '#94a3b8',
                borderDash: [6, 4],
                pointRadius: 0,
                borderWidth: 2,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { stacked: true, grid: { display: false } },
              y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
            },
          }}
        />
      </div>
    </Card>
  );
}

function TypeTable({ data }: { data: ClosuresScorecard }) {
  const { months, byType, teamTargets, hdisOnboarded } = data;
  const elapsed = (m: string) => m <= data.currentMonth;
  const tot = (f: (p: PerType) => number) => months.reduce((s, m) => s + f(byType[m]), 0);
  const cell = (m: string, v: number) => (elapsed(m) ? v : '·');
  return (
    <Card pad={false}>
      <div style={{ padding: '16px 20px 0' }}>
        <SectionTitle color="var(--gold)">Closures by type</SectionTitle>
        <div className="skc-sub" style={{ marginTop: 2 }}>
          Achievement = RAPYD Contract + FTE ÷ that month&apos;s team target; internal is on top
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Type</th>
              {months.map((m) => (
                <th key={m}>{monthShort(m)}</th>
              ))}
              <th>FY total</th>
            </tr>
          </thead>
          <tbody>
            {(['RADC', 'RADF'] as ClosureType[]).map((t) => (
              <tr key={t}>
                <td style={{ fontWeight: 600 }}>{TYPE_LABEL[t]}</td>
                {months.map((m) => (
                  <td key={m} className="mono">
                    {cell(m, byType[m][t])}
                  </td>
                ))}
                <td className="mono">{tot((p) => p[t])}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 600 }}>
              <td>RAPYD total</td>
              {months.map((m) => (
                <td key={m} className="mono">
                  {cell(m, rapyd(byType[m]))}
                </td>
              ))}
              <td className="mono">{tot(rapyd)}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Internal</td>
              {months.map((m) => (
                <td key={m} className="mono">
                  {cell(m, byType[m].Internal)}
                </td>
              ))}
              <td className="mono">{tot((p) => p.Internal)}</td>
            </tr>
            <tr style={{ fontWeight: 600 }}>
              <td>All closures</td>
              {months.map((m) => (
                <td key={m} className="mono">
                  {cell(m, sum(byType[m]))}
                </td>
              ))}
              <td className="mono">{tot(sum)}</td>
            </tr>
            <tr>
              <td className="muted">Team target</td>
              {months.map((m) => (
                <td key={m} className="mono muted">
                  {teamTargets[m]}
                </td>
              ))}
              <td className="mono muted">{months.reduce((s, m) => s + teamTargets[m], 0)}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Achievement (RAPYD vs target)</td>
              {months.map((m) => (
                <td
                  key={m}
                  className="mono"
                  style={{
                    color: cellTone(rapyd(byType[m]), teamTargets[m], elapsed(m), data.benchmark),
                  }}
                >
                  {elapsed(m) && teamTargets[m] ? pct(rapyd(byType[m]) / teamTargets[m]) : '·'}
                </td>
              ))}
              <td className="mono">
                {data.kpis.rapydPctOfTarget === null ? '—' : pct(data.kpis.rapydPctOfTarget)}
              </td>
            </tr>
            <tr>
              <td
                className="muted"
                title="Onboarded profiles on HDIS requirements raised that month (Contract + FTE + Internal) — a cross-check, not the official figure"
              >
                HDIS cross-check (onboarded)
              </td>
              {months.map((m) => {
                const h = sum(hdisOnboarded[m]);
                const diff = h - sum(byType[m]);
                return (
                  <td
                    key={m}
                    className="mono muted"
                    title={elapsed(m) ? `HDIS ${h} vs logged ${sum(byType[m])}` : undefined}
                    style={
                      diff !== 0 && elapsed(m) ? { color: 'var(--amber, #d97706)' } : undefined
                    }
                  >
                    {cell(m, h)}
                  </td>
                );
              })}
              <td className="mono muted">
                {months.reduce((s, m) => s + sum(hdisOnboarded[m]), 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RecruiterTable({ data }: { data: ClosuresScorecard }) {
  const [filter, setFilter] = useState<ClosureType | 'all'>('all');
  const pick = (p: PerType) => (filter === 'all' ? sum(p) : p[filter]);
  const elapsed = (m: string) => m <= data.currentMonth;
  // Colours compare RAPYD (Contract + FTE) with the recruiter target; internal is on top.
  const toneFor = (p: PerType, target: number | null, m: string) =>
    filter === 'Internal' ? undefined : cellTone(rapyd(p), target, elapsed(m), data.benchmark);
  return (
    <Card pad={false}>
      <div style={{ padding: '16px 20px 0' }}>
        <SectionTitle color="var(--blue)">Recruiter scorecard</SectionTitle>
        <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
          {(['all', ...TYPES] as const).map((t) => (
            <Btn key={t} small variant={filter === t ? 'pri' : 'gho'} onClick={() => setFilter(t)}>
              {t === 'all' ? 'All types' : TYPE_LABEL[t]}
            </Btn>
          ))}
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Recruiter</th>
              {data.months.map((m) => (
                <th key={m}>{monthShort(m)}</th>
              ))}
              <th>FY total</th>
              <th>Target / mo</th>
            </tr>
          </thead>
          <tbody>
            {data.recruiters.map((r) => (
              <tr key={r.userId ?? 'unassigned'}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                {data.months.map((m) => (
                  <td
                    key={m}
                    className="mono"
                    style={{ color: toneFor(r.perMonth[m], r.target, m), fontWeight: 600 }}
                  >
                    {elapsed(m) ? pick(r.perMonth[m]) : '·'}
                  </td>
                ))}
                <td className="mono">{data.months.reduce((s, m) => s + pick(r.perMonth[m]), 0)}</td>
                <td className="mono muted">{r.target ?? '—'}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 600 }}>
              <td>Team total</td>
              {data.months.map((m) => (
                <td key={m} className="mono">
                  {elapsed(m) ? pick(data.byType[m]) : '·'}
                </td>
              ))}
              <td className="mono">{data.months.reduce((s, m) => s + pick(data.byType[m]), 0)}</td>
              <td className="mono muted">{data.teamDefault}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="skc-sub" style={{ padding: '8px 20px 16px' }}>
        Colours compare RAPYD Contract + FTE closures with each target; internal closures are
        counted on top. Green: target (or {pct(data.benchmark)} of it) met · Amber: below · Red: no
        RAPYD closures in an elapsed month.
      </div>
    </Card>
  );
}

function AddClosure({ data }: { data: ClosuresScorecard }) {
  const create = useCreateClosure();
  const imp = useImportClosures();
  const { showToast } = useToast();
  const [month, setMonth] = useState(
    data.months.includes(data.currentMonth) ? data.currentMonth : data.months[0],
  );
  const [userId, setUserId] = useState<string>('');
  const [type, setType] = useState<ClosureType>('RADC');
  const [count, setCount] = useState(1);
  const [client, setClient] = useState('');
  const [candidate, setCandidate] = useState('');
  const [text, setText] = useState('');
  const [report, setReport] = useState<string | null>(null);

  function submit() {
    create.mutate(
      {
        month,
        userId: userId || null,
        type,
        count,
        client: client || null,
        candidate: candidate || null,
      },
      {
        onSuccess: () => {
          showToast('Closure added');
          setClient('');
          setCandidate('');
          setCount(1);
        },
        onError: (e) => showToast(e instanceof Error ? e.message : 'Could not add closure', 'err'),
      },
    );
  }

  function run(dryRun: boolean) {
    imp.mutate(
      { text, dryRun },
      {
        onSuccess: (r) => {
          if (r.errors.length) {
            setReport(
              `${r.errors.length} problem row(s), nothing imported:\n` +
                r.errors.map((e) => `Row ${e.line}: ${e.error}`).join('\n'),
            );
          } else if (dryRun) {
            setReport(`${r.valid} row(s) look good — press Import to save.`);
          } else {
            setReport(null);
            setText('');
            showToast(`Imported ${r.imported} row(s)`);
          }
        },
        onError: (e) => showToast(e instanceof Error ? e.message : 'Import failed', 'err'),
      },
    );
  }

  return (
    <Card>
      <SectionTitle color="var(--green, #16a34a)">Add closures</SectionTitle>
      <div className="filterbar" style={{ flexWrap: 'wrap' }}>
        <div className="field">
          <label htmlFor="cl-m">Month</label>
          <select id="cl-m" value={month} onChange={(e) => setMonth(e.target.value)}>
            {data.months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cl-r">Recruiter</label>
          <select id="cl-r" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">VAYUZ Internal (unassigned)</option>
            {data.userOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cl-t">Type</label>
          <select id="cl-t" value={type} onChange={(e) => setType(e.target.value as ClosureType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cl-c">Closures</label>
          <input
            id="cl-c"
            type="number"
            min={0}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </div>
        <div className="field">
          <label htmlFor="cl-cl">Client (optional)</label>
          <input id="cl-cl" value={client} onChange={(e) => setClient(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cl-ca">Candidate (optional)</label>
          <input id="cl-ca" value={candidate} onChange={(e) => setCandidate(e.target.value)} />
        </div>
        <Btn onClick={submit} loading={create.isPending}>
          Add closure
        </Btn>
      </div>

      <div style={{ marginTop: 20 }}>
        <SectionTitle>Paste rows from Excel</SectionTitle>
        <div className="skc-sub">
          One closure line per row, columns in this order:{' '}
          <code>Month, Recruiter, Type, Closures, Client, Candidate</code>. Only the first three are
          required. Month can be <code>Oct 2026</code>, <code>2026-10</code> or a date like{' '}
          <code>15-10-2026</code>. First names work for recruiters. Type: RAPYD Contract / RAPYD FTE
          / Internal.
        </div>
        <textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ width: '100%', marginTop: 8, fontFamily: 'monospace' }}
          aria-label="Rows to import"
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Btn
            variant="gho"
            disabled={!text.trim()}
            loading={imp.isPending}
            onClick={() => run(true)}
          >
            Check rows
          </Btn>
          <Btn disabled={!text.trim()} loading={imp.isPending} onClick={() => run(false)}>
            Import
          </Btn>
        </div>
        {report && (
          <pre className="skc-sub" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
            {report}
          </pre>
        )}
      </div>
    </Card>
  );
}

function Entries({ data, canDelete }: { data: ClosuresScorecard; canDelete: boolean }) {
  const del = useDeleteClosure();
  const { showToast } = useToast();
  if (data.entries.length === 0) {
    return <Empty title="No closures logged yet" icon="✔" />;
  }
  return (
    <Card pad={false}>
      <div style={{ padding: '16px 20px 0' }}>
        <SectionTitle color="var(--violet)">Entries</SectionTitle>
        <div className="skc-sub">
          {data.entries.length} in {fyLabel(data.fy)}
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Month</th>
              <th>Recruiter</th>
              <th>Type</th>
              <th>Closures</th>
              <th>Client</th>
              <th>Candidate</th>
              {canDelete && <th />}
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.id}>
                <td>{monthShort(e.month)}</td>
                <td>{e.recruiterName}</td>
                <td>{TYPE_LABEL[e.type]}</td>
                <td className="mono">×{e.count}</td>
                <td>{e.client ?? <span className="muted">—</span>}</td>
                <td>{e.candidate ?? <span className="muted">—</span>}</td>
                {canDelete && (
                  <td>
                    <Btn
                      small
                      variant="gho"
                      onClick={() => {
                        if (!window.confirm('Remove this closure entry?')) return;
                        del.mutate(e.id, {
                          onSuccess: () => showToast('Entry removed'),
                          onError: (err) =>
                            showToast(
                              err instanceof Error ? err.message : 'Could not remove',
                              'err',
                            ),
                        });
                      }}
                    >
                      ×
                    </Btn>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Targets({ data }: { data: ClosuresScorecard }) {
  const save = useSaveClosureTargets();
  const { showToast } = useToast();
  const [teamDefault, setTeamDefault] = useState(String(data.teamDefault));
  const [rec, setRec] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      data.recruiters.filter((r) => r.userId).map((r) => [r.userId!, r.target?.toString() ?? '']),
    ),
  );
  const [months, setMonths] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      data.months
        .filter((m) => data.teamTargets[m] !== data.teamDefault)
        .map((m) => [m, String(data.teamTargets[m])]),
    ),
  );
  const [newMonth, setNewMonth] = useState('');

  function submit() {
    const toNum = (v: string) => (v.trim() === '' ? null : Number(v));
    save.mutate(
      {
        teamDefault: Number(teamDefault),
        teamMonths: Object.fromEntries(
          data.months.map((m) => [m, m in months ? toNum(months[m]) : null]),
        ),
        recruiters: Object.fromEntries(Object.entries(rec).map(([id, v]) => [id, toNum(v)])),
      },
      {
        onSuccess: () => showToast('Targets saved'),
        onError: (e) => showToast(e instanceof Error ? e.message : 'Could not save', 'err'),
      },
    );
  }

  return (
    <Card>
      <SectionTitle color="var(--gold)">Targets</SectionTitle>
      <div className="filterbar" style={{ flexWrap: 'wrap' }}>
        <div className="field">
          <label htmlFor="tg-team">Team target per month</label>
          <input
            id="tg-team"
            type="number"
            min={0}
            value={teamDefault}
            onChange={(e) => setTeamDefault(e.target.value)}
            style={{ width: 90 }}
          />
        </div>
      </div>
      <div className="skc-sub" style={{ marginTop: 12 }}>
        Month-specific team targets
      </div>
      <div className="filterbar" style={{ flexWrap: 'wrap' }}>
        {Object.entries(months).map(([m, v]) => (
          <div className="field" key={m}>
            <label htmlFor={`tg-${m}`}>{formatMonth(m)}</label>
            <input
              id={`tg-${m}`}
              type="number"
              min={0}
              value={v}
              onChange={(e) => setMonths((s) => ({ ...s, [m]: e.target.value }))}
              style={{ width: 90 }}
            />
            <Btn
              small
              variant="gho"
              onClick={() =>
                setMonths((s) => {
                  const { [m]: _gone, ...rest } = s;
                  return rest;
                })
              }
            >
              Remove
            </Btn>
          </div>
        ))}
        <div className="field">
          <label htmlFor="tg-add">Add a month</label>
          <select id="tg-add" value={newMonth} onChange={(e) => setNewMonth(e.target.value)}>
            <option value="">Select…</option>
            {data.months
              .filter((m) => !(m in months))
              .map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
          </select>
        </div>
        <Btn
          variant="gho"
          disabled={!newMonth}
          onClick={() => {
            setMonths((s) => ({ ...s, [newMonth]: teamDefault }));
            setNewMonth('');
          }}
        >
          Add
        </Btn>
      </div>
      <div className="skc-sub" style={{ marginTop: 12 }}>
        Recruiter targets per month — leave blank for no individual target (measured on the team
        target instead).
      </div>
      <div className="filterbar" style={{ flexWrap: 'wrap' }}>
        {data.recruiters
          .filter((r) => r.userId)
          .map((r) => (
            <div className="field" key={r.userId}>
              <label htmlFor={`tg-r-${r.userId}`}>{r.name}</label>
              <input
                id={`tg-r-${r.userId}`}
                type="number"
                min={0}
                value={rec[r.userId!] ?? ''}
                onChange={(e) => setRec((s) => ({ ...s, [r.userId!]: e.target.value }))}
                style={{ width: 90 }}
              />
            </div>
          ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <Btn onClick={submit} loading={save.isPending}>
          Save targets
        </Btn>
      </div>
    </Card>
  );
}
