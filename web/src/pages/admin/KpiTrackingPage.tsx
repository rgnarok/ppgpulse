import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { Card, SectionTitle, Btn, Pill } from '../../components/ui';
import {
  useKpis,
  useKpiCalendar,
  useKpiTargets,
  useSetKpiTarget,
  useClearKpiTarget,
  useSetKpiDefaultTarget,
  type KpiCalendarDay,
} from '../../lib/hooks';
import { formatMonth } from '../../lib/format';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  return cells;
}

const COLOR_BG: Record<string, string> = {
  green: 'rgba(34,197,94,.22)',
  amber: 'rgba(234,179,8,.24)',
  red: 'rgba(239,68,68,.20)',
  none: 'transparent',
};
const COLOR_BORDER: Record<string, string> = {
  green: 'rgba(34,197,94,.55)',
  amber: 'rgba(234,179,8,.6)',
  red: 'rgba(239,68,68,.5)',
  none: 'var(--border, #e5e7eb)',
};

export default function KpiTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: kpis = [] } = useKpis();
  const kpi = kpis.find((k) => k.id === id) ?? null;

  const today = useMemo(() => todayISO(), []);
  const [month, setMonth] = useState(today.slice(0, 7));
  const { data: cal, isLoading: calLoading } = useKpiCalendar(id ?? null, month);

  if (kpi && kpi.trackedMetric !== 'interviews_per_day') {
    return (
      <AppShell title="KPI tracking" subtitle="This KPI isn't wired to a tracked metric yet">
        <Card>
          <p className="muted">
            Only KPIs with an automated data source (currently just "Interviews per Day") have a
            tracking calendar.
          </p>
          <div style={{ marginTop: 12 }}>
            <Btn variant="gho" onClick={() => navigate('/admin/kpis')}>
              ‹ Back to KPIs
            </Btn>
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={kpi ? `${kpi.symbol} ${kpi.title}` : 'KPI tracking'}
      subtitle={kpi ? `Target: ${kpi.target} — tracked live from the Interviews log` : ''}
    >
      <div style={{ marginBottom: 12 }}>
        <button className="lnk" onClick={() => navigate('/admin/kpis')}>
          ‹ Back to KPIs
        </button>
      </div>

      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <SectionTitle>{formatMonth(month)}</SectionTitle>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="kt-month">Month</label>
            <input
              id="kt-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        </div>

        {cal && (
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            {cal.consultantCount} consultant(s) in scope · team target {cal.totalTarget} / day
          </div>
        )}

        <div className="cal-grid" style={{ marginTop: 14 }}>
          {DOW.map((d) => (
            <div className="cal-dow" key={d}>
              {d}
            </div>
          ))}
          {calLoading || !cal
            ? null
            : monthCells(month).map((date, i) => {
                if (date === null) return <div className="cal-c empty" key={`e${i}`} />;
                const day: KpiCalendarDay | undefined = cal.days.find((d) => d.date === date);
                const color = day?.color ?? 'none';
                return (
                  <div
                    key={date}
                    className={`cal-c${date === today ? ' today' : ''}`}
                    style={{
                      background: COLOR_BG[color],
                      border: `1px solid ${COLOR_BORDER[color]}`,
                    }}
                    title={
                      day ? `${date}: ${day.actual}/${day.target} interviews` : `${date}: no data`
                    }
                  >
                    <div className="cn">{Number(date.slice(-2))}</div>
                    {day && day.color !== 'none' ? (
                      <div className="cal-b">
                        {day.actual}/{day.target}
                      </div>
                    ) : null}
                  </div>
                );
              })}
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', fontSize: 12 }}>
          <Legend color="green" label="At or above target" />
          <Legend color="amber" label="80%+ of target" />
          <Legend color="red" label="Below 80% of target" />
          <Legend color="none" label="No data logged" />
        </div>
      </Card>

      <div style={{ marginTop: 16 }}>
        <Card>
          <SectionTitle>Per-person targets</SectionTitle>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Every consultant defaults to the KPI's target ({kpi?.numericTarget ?? 0}/day). Override
            an individual's target below.
          </p>
          {id && kpi && <DefaultTargetRow kpiId={id} numericTarget={kpi.numericTarget ?? 0} />}
          {id && <TargetsTable kpiId={id} />}
        </Card>
      </div>
    </AppShell>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          background: COLOR_BG[color],
          border: `1px solid ${COLOR_BORDER[color]}`,
          display: 'inline-block',
        }}
      />
      <span className="muted">{label}</span>
    </div>
  );
}

function DefaultTargetRow({ kpiId, numericTarget }: { kpiId: string; numericTarget: number }) {
  const [value, setValue] = useState(String(numericTarget));
  const setDefault = useSetKpiDefaultTarget(kpiId);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 14,
        padding: '10px 12px',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 8,
      }}
    >
      <strong style={{ fontSize: 13 }}>Default target / day</strong>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: 90 }}
      />
      <Btn
        small
        disabled={setDefault.isPending}
        onClick={() => setDefault.mutate(Number(value) || 0)}
      >
        {setDefault.isPending ? 'Saving…' : 'Save default'}
      </Btn>
    </div>
  );
}

function TargetsTable({ kpiId }: { kpiId: string }) {
  const { data: targets = [], isLoading } = useKpiTargets(kpiId);
  const setTarget = useSetKpiTarget(kpiId);
  const clearTarget = useClearKpiTarget(kpiId);
  const [edits, setEdits] = useState<Record<string, string>>({});

  if (isLoading) return <div className="empty">Loading…</div>;
  if (targets.length === 0) {
    return (
      <div className="muted" style={{ padding: 16 }}>
        No consultants in scope yet.
      </div>
    );
  }

  return (
    <div className="tbl-wrap" style={{ marginTop: 14 }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Consultant</th>
            <th>Team</th>
            <th>Target / day</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => {
            const value = edits[t.consultantId] ?? String(t.target);
            return (
              <tr key={t.consultantId}>
                <td style={{ fontWeight: 600 }}>{t.name}</td>
                <td className="muted">{t.team}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      min={0}
                      value={value}
                      onChange={(e) =>
                        setEdits((prev) => ({ ...prev, [t.consultantId]: e.target.value }))
                      }
                      style={{ width: 80 }}
                    />
                    {t.isOverride && <Pill tone="p-amber">override</Pill>}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="lnk"
                      disabled={setTarget.isPending}
                      onClick={() =>
                        setTarget.mutate({
                          consultantId: t.consultantId,
                          target: Number(value) || 0,
                        })
                      }
                    >
                      Save
                    </button>
                    {t.isOverride && (
                      <button
                        className="lnk"
                        style={{ color: 'var(--danger, #c0392b)' }}
                        disabled={clearTarget.isPending}
                        onClick={() => clearTarget.mutate(t.consultantId)}
                      >
                        Reset to default
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
