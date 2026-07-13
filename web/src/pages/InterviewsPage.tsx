import { useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Card, SectionTitle, Empty } from '../components/ui';
import { useAuth } from '../lib/auth';
import { can } from '../lib/permissions';
import { api } from '../lib/api';
import { useConsultants, useInterviewMonth, useInterviewDay, useApiMutation } from '../lib/hooks';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  return cells;
}

export default function InterviewsPage() {
  const { me } = useAuth();
  const editable = can(me, 'interviews', 'edit');
  const [month, setMonth] = useState('2026-06');
  const [selected, setSelected] = useState<string | null>(null);
  const { data: monthData } = useInterviewMonth(month);
  const counts = monthData?.counts ?? {};

  return (
    <AppShell title="Interviews" subtitle="Monthly calendar with per-day logs">
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="filterbar">
          <div className="field">
            <label htmlFor="iv-month">Month</label>
            <input
              id="iv-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="grid g-58">
        <Card>
          <SectionTitle>{month}</SectionTitle>
          <div className="cal-grid" style={{ marginTop: 12 }}>
            {DOW.map((d) => (
              <div className="cal-dow" key={d}>
                {d}
              </div>
            ))}
            {monthCells(month).map((date, i) =>
              date === null ? (
                <div className="cal-c empty" key={`e${i}`} />
              ) : (
                <div
                  key={date}
                  className={`cal-c ${counts[date] ? 'has' : ''} ${selected === date ? 'sel' : ''}`}
                  onClick={() => setSelected(date)}
                >
                  <div className="cn">{Number(date.slice(-2))}</div>
                  {counts[date] ? <div className="cal-b">{counts[date]}</div> : null}
                </div>
              ),
            )}
          </div>
        </Card>
        <Card>
          {selected ? (
            <DayPanel date={selected} editable={editable} month={month} />
          ) : (
            <Empty title="Select a day" icon="▦">
              Pick a date on the calendar to see mid-day and end-day logs.
            </Empty>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function DayPanel({ date, editable, month }: { date: string; editable: boolean; month: string }) {
  const { data } = useInterviewDay(date);
  const { data: consultants = [] } = useConsultants();
  const create = useApiMutation(
    (body: Record<string, unknown>) => api('/interviews', { method: 'POST', body }),
    [
      ['interview-day', date],
      ['interviews', month],
    ],
  );
  const [candidate, setCandidate] = useState('');
  const [session, setSession] = useState<'mid' | 'end'>('mid');
  const [consultantId, setConsultantId] = useState('');

  function add() {
    if (!candidate.trim()) return;
    create.mutate(
      { date, session, candidate, ppgConsultantId: consultantId || null },
      { onSuccess: () => setCandidate('') },
    );
  }

  return (
    <div>
      <SectionTitle>{date}</SectionTitle>
      {(['mid', 'end'] as const).map((s) => {
        const rows = (data?.[s] ?? []) as {
          id: string;
          candidate: string;
          ppgConsultantName: string | null;
          status: string | null;
        }[];
        return (
          <div key={s} style={{ marginTop: 14 }}>
            <div
              className="muted"
              style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}
            >
              {s === 'mid' ? 'Mid-day' : 'End-day'} ({rows.length})
            </div>
            {rows.map((r) => (
              <div className="log" key={r.id}>
                <span className="who">{r.candidate}</span>
                <span className="muted">{r.ppgConsultantName ?? '—'}</span>
                <span className="muted">{r.status ?? ''}</span>
              </div>
            ))}
          </div>
        );
      })}
      {data?.byConsultant?.length ? (
        <div style={{ marginTop: 16 }}>
          <SectionTitle color="var(--sky)">Consultant-wise</SectionTitle>
          <div className="legend" style={{ marginTop: 8 }}>
            {data.byConsultant.map((b) => (
              <div className="lg-row" key={b.name}>
                <span className="lg-dot" style={{ background: 'var(--primary)' }} />
                {b.name}
                <span className="lg-v">{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {editable && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div className="filterbar">
            <div className="field">
              <label>Candidate</label>
              <input
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
                placeholder="Name"
              />
            </div>
            <div className="field">
              <label>Session</label>
              <select value={session} onChange={(e) => setSession(e.target.value as 'mid' | 'end')}>
                <option value="mid">Mid-day</option>
                <option value="end">End-day</option>
              </select>
            </div>
            <div className="field">
              <label>Consultant</label>
              <select value={consultantId} onChange={(e) => setConsultantId(e.target.value)}>
                <option value="">—</option>
                {consultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="iv-add" onClick={add} disabled={create.isPending}>
            + Add interview
          </button>
        </div>
      )}
    </div>
  );
}
